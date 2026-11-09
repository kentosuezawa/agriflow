export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export function inputFailure(error) {
  if (error instanceof AppError) return error;
  if (error instanceof TypeError) return new AppError(400,'INVALID_INPUT','入力の型が不正です');
  return new AppError(400,'INVALID_INPUT',error.message);
}
