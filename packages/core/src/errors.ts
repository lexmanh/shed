/**
 * Custom error classes for Shed core.
 * Never throw raw strings.
 */

export class ShedError extends Error {
  override readonly name: string = 'ShedError';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class SafetyViolationError extends ShedError {
  override readonly name = 'SafetyViolationError';
  constructor(
    message: string,
    public readonly path: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export class DetectorError extends ShedError {
  override readonly name = 'DetectorError';
  constructor(
    message: string,
    public readonly detector: string,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

export class PlatformError extends ShedError {
  override readonly name = 'PlatformError';
  constructor(
    message: string,
    public readonly platform: NodeJS.Platform,
  ) {
    super(message);
  }
}

export class DryRunViolation extends ShedError {
  override readonly name = 'DryRunViolation';
  constructor(message = 'Attempted destructive operation without explicit execute flag') {
    super(message);
  }
}
