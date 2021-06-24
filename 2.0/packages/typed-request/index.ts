import { ResponseType, RequestBody, TRequest, TRequestApi, TRequestError, TRequestMiddleware, TRequestOptions, TRequestResponse, TRequestBasic } from './interface'
export * from './interface'

export function factory (basic: TRequestBasic, middles: TRequestMiddleware[]): TRequest {
    const request: TRequest = async function <
        T extends RequestBody = RequestBody,
        R extends TRequestResponse['data'] = TRequestResponse['data']
    > (
        options: TRequestOptions<T>
    ): Promise<TRequestResponse<R>> {
        const { middlewares } = options
        // 全局中间件在外层 自定义中间件在内层
        const concatMids = (middles ?? []).concat(middlewares ?? [])
        function dispatch (i: number): (options: TRequestOptions<T>) => Promise<TRequestResponse<R>> {
            const mid = concatMids[i]

            if (i === concatMids.length) {
                return (options) => basic(options)
            } else {
                return (options) => mid(options, dispatch(i + 1))
            }
        }
        const resp = await dispatch(0)(options)
        return resp as TRequestResponse<R>
    }

    const to: TRequest['to'] = async function <
        T extends RequestBody = RequestBody,
        R extends TRequestResponse['data'] = TRequestResponse['data'],
        E extends Record<string | number | symbol, any> = {}
    > (
        options: TRequestOptions<T>
    ) {
        try {
            const data = await request<T, R>(options)
            return [data, null]
        } catch (e) {
            const error: TRequestError<E> = {
                error: e
            } as TRequestError<E>
            return [null, error]
        }
    }
    request.to = to

    request.api = function <
        T extends RequestBody = RequestBody,
        R extends TRequestResponse['data'] = TRequestResponse['data'],
        E extends Record<string | number | symbol, any> = {}
    > (
        common: Partial<TRequestOptions<T>>
    ): TRequestApi<T, R, E> {
        const api: TRequestApi<T, R, E> = async function <NT extends T, NR extends R> (options: Partial<TRequestOptions<NT>>) {
            const data = await request<NT, NR>({
                ...common,
                ...options
            } as TRequestOptions<NT>)
            return data
        }
        const to: TRequestApi<T, R, E>['to'] = async function <NT extends T, NR extends R, NE extends E> (
            options: Partial<TRequestOptions<NT>> & NT
        ) {
            try {
                const data = await api<NT, NR>({
                    ...common,
                    ...options
                } as Partial<TRequestOptions<NT>> & NT)
                return [data, null]
            } catch (e) {
                const error: TRequestError<NE> = {
                    error: e
                } as TRequestError<NE>
                return [null, error]
            }
        }
        api.to = to
        return api
    }

    request.create = function (
        middlewares: TRequestMiddleware | TRequestMiddleware[]
    ): TRequest {
        return factory(basic, [...middles].concat(middlewares))
    }

    return request
}

export type ApiDefinition<Options extends unknown, Result extends Promise<TRequestResponse>> = (trq: TRequest, options: Options) => Result;
export function defineApi<
    Options extends unknown,
    Result extends Promise<TRequestResponse>
> (definition: ApiDefinition<Options, Result>): (trq: TRequest) => (options: Options) => Result {
    return trq => options => definition(trq, options)
}

type DefFn<
    Options extends unknown = any,
    Result extends Promise<TRequestResponse> = Promise<TRequestResponse>
> = (trq: TRequest) => (options: Options) => Result
export function defineApis<T extends Record<string, DefFn>> (apis: T): (trq: TRequest) => { [K in keyof T]: (options: Parameters<ReturnType<T[K]>>[0]) => ReturnType<ReturnType<T[K]>>} {
    return trq => {
        const result: { [x in string]: (options: unknown) => Promise<TRequestResponse>} = {}
        Object.keys(apis).forEach(k => {
            result[k] = apis[k](trq)
        })
        return result as { [K in keyof T]: (options: Parameters<ReturnType<T[K]>>[0]) => ReturnType<ReturnType<T[K]>>}
    }
}