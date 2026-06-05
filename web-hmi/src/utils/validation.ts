/**
 * utils/validation.ts
 * Input validation and error handling utilities
 */

export interface ValidationError {
  field: string;
  message: string;
  type: 'required' | 'invalid' | 'range' | 'format' | 'network' | 'device';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validators - Pure functions that return ValidationError or null
 */

export const validators = {
  /**
   * Required field validator
   */
  required: (value: string | number | undefined, fieldName: string): ValidationError | null => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return {
        field: fieldName,
        message: `${fieldName} is required`,
        type: 'required',
      };
    }
    return null;
  },

  /**
   * IP address validator
   */
  ipAddress: (value: string, fieldName: string): ValidationError | null => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(value)) {
      return {
        field: fieldName,
        message: `${fieldName} must be a valid IP address (e.g., 192.168.1.100)`,
        type: 'format',
      };
    }

    const parts = value.split('.').map(Number);
    if (parts.some((part) => part < 0 || part > 255)) {
      return {
        field: fieldName,
        message: `${fieldName} has invalid octets (must be 0-255)`,
        type: 'format',
      };
    }

    return null;
  },

  /**
   * Hostname/domain validator
   */
  hostname: (value: string, fieldName: string): ValidationError | null => {
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!hostnameRegex.test(value)) {
      return {
        field: fieldName,
        message: `${fieldName} must be a valid hostname (e.g., h2o-tower.local)`,
        type: 'format',
      };
    }
    return null;
  },

  /**
   * URL/Gateway validator
   */
  url: (value: string, fieldName: string): ValidationError | null => {
    try {
      new URL(value);
      return null;
    } catch {
      return {
        field: fieldName,
        message: `${fieldName} must be a valid URL (e.g., https://api.example.com/device)`,
        type: 'format',
      };
    }
  },

  /**
   * Port number validator
   */
  port: (value: number, fieldName: string): ValidationError | null => {
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return {
        field: fieldName,
        message: `${fieldName} must be between 1 and 65535`,
        type: 'range',
      };
    }
    return null;
  },

  /**
   * PWM duty cycle validator (0-1000)
   */
  pwmDuty: (value: number, fieldName: string): ValidationError | null => {
    if (!Number.isInteger(value) || value < 0 || value > 1000) {
      return {
        field: fieldName,
        message: `${fieldName} must be between 0 and 1000`,
        type: 'range',
      };
    }
    return null;
  },

  /**
   * GPIO state validator (0 or 1)
   */
  gpioState: (value: number, fieldName: string): ValidationError | null => {
    if (![0, 1].includes(value)) {
      return {
        field: fieldName,
        message: `${fieldName} must be 0 (OFF) or 1 (ON)`,
        type: 'range',
      };
    }
    return null;
  },

  /**
   * Number range validator
   */
  range: (
    value: number,
    min: number,
    max: number,
    fieldName: string
  ): ValidationError | null => {
    if (value < min || value > max) {
      return {
        field: fieldName,
        message: `${fieldName} must be between ${min} and ${max}`,
        type: 'range',
      };
    }
    return null;
  },

  /**
   * Pipeline name validator
   */
  pipelineName: (value: string, fieldName: string): ValidationError | null => {
    if (value.length < 1) {
      return {
        field: fieldName,
        message: `${fieldName} cannot be empty`,
        type: 'required',
      };
    }
    if (value.length > 50) {
      return {
        field: fieldName,
        message: `${fieldName} cannot exceed 50 characters`,
        type: 'format',
      };
    }
    if (!/^[a-zA-Z0-9_\s-]+$/.test(value)) {
      return {
        field: fieldName,
        message: `${fieldName} can only contain letters, numbers, spaces, hyphens, and underscores`,
        type: 'format',
      };
    }
    return null;
  },

  /**
   * Pin number validator (ESP32-C3: 0-21)
   */
  pinNumber: (value: number, fieldName: string): ValidationError | null => {
    if (!Number.isInteger(value) || value < 0 || value > 21) {
      return {
        field: fieldName,
        message: `${fieldName} must be between 0 and 21 (valid ESP32-C3 pins)`,
        type: 'range',
      };
    }
    return null;
  },
};

/**
 * Form validators - combine multiple validators for a field
 */

export const formValidators = {
  /**
   * Validate device IP input
   */
  deviceIp: (value: string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const requiredError = validators.required(value, 'Device IP');
    if (requiredError) errors.push(requiredError);

    if (value && !requiredError) {
      const ipError = validators.ipAddress(value, 'Device IP');
      if (ipError) errors.push(ipError);
    }

    return errors;
  },

  /**
   * Validate device hostname input
   */
  deviceHostname: (value: string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const requiredError = validators.required(value, 'Device Hostname');
    if (requiredError) errors.push(requiredError);

    if (value && !requiredError) {
      const hostnameError = validators.hostname(value, 'Device Hostname');
      if (hostnameError) errors.push(hostnameError);
    }

    return errors;
  },

  /**
   * Validate gateway URL input
   */
  gatewayUrl: (value: string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const requiredError = validators.required(value, 'Gateway URL');
    if (requiredError) errors.push(requiredError);

    if (value && !requiredError) {
      const urlError = validators.url(value, 'Gateway URL');
      if (urlError) errors.push(urlError);
    }

    return errors;
  },

  /**
   * Validate port input
   */
  port: (value: number | string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const num = typeof value === 'string' ? parseInt(value) : value;

    if (isNaN(num)) {
      errors.push({
        field: 'Port',
        message: 'Port must be a number',
        type: 'format',
      });
    } else {
      const portError = validators.port(num, 'Port');
      if (portError) errors.push(portError);
    }

    return errors;
  },

  /**
   * Validate PWM duty cycle
   */
  pwmDuty: (value: number | string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const num = typeof value === 'string' ? parseInt(value) : value;

    if (isNaN(num)) {
      errors.push({
        field: 'PWM Duty',
        message: 'PWM duty must be a number',
        type: 'format',
      });
    } else {
      const dutyError = validators.pwmDuty(num, 'PWM Duty');
      if (dutyError) errors.push(dutyError);
    }

    return errors;
  },

  /**
   * Validate pipeline name
   */
  pipelineName: (value: string): ValidationError[] => {
    const errors: ValidationError[] = [];
    const nameError = validators.pipelineName(value, 'Pipeline Name');
    if (nameError) errors.push(nameError);
    return errors;
  },
};

/**
 * Error message helper
 */
export const getErrorMessage = (errors: ValidationError[]): string => {
  if (errors.length === 0) return '';
  if (errors.length === 1) return errors[0].message;
  return `${errors.length} errors: ${errors.map((e) => e.message).join('; ')}`;
};

/**
 * Check if form has any errors
 */
export const hasErrors = (errors: Record<string, ValidationError[]>): boolean => {
  return Object.values(errors).some((fieldErrors) => fieldErrors.length > 0);
};

/**
 * Get first error message for a field
 */
export const getFieldError = (errors: Record<string, ValidationError[]>, fieldName: string): string => {
  const fieldErrors = errors[fieldName] || [];
  return fieldErrors.length > 0 ? fieldErrors[0].message : '';
};
