/**
 * Result<T, E> — patrón funcional para manejo de errores sin excepciones
 * en la capa de aplicación.
 */
export class Result<T, E = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static fail<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  get value(): T {
    if (!this._isSuccess) throw new Error('Cannot get value of a failure');
    return this._value as T;
  }

  get error(): E {
    if (this._isSuccess) throw new Error('Cannot get error of a success');
    return this._error as E;
  }
}
