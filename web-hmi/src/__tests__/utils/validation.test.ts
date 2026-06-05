import {
  validators,
  formValidators,
  getErrorMessage,
  hasErrors,
  getFieldError,
} from '@utils/validation';

describe('Validators - Unit Tests', () => {
  describe('required validator', () => {
    it('should return null for non-empty string', () => {
      const result = validators.required('test value', 'fieldName');
      expect(result).toBeNull();
    });

    it('should return error for empty string', () => {
      const result = validators.required('', 'fieldName');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('fieldName');
      expect(result?.type).toBe('required');
    });

    it('should return error for whitespace-only string', () => {
      const result = validators.required('   ', 'fieldName');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('required');
    });

    it('should return error for undefined', () => {
      const result = validators.required(undefined as any, 'fieldName');
      expect(result).not.toBeNull();
    });
  });

  describe('ipAddress validator', () => {
    it('should accept valid IP addresses', () => {
      expect(validators.ipAddress('192.168.1.100', 'ip')).toBeNull();
      expect(validators.ipAddress('10.0.0.1', 'ip')).toBeNull();
      expect(validators.ipAddress('255.255.255.255', 'ip')).toBeNull();
      expect(validators.ipAddress('0.0.0.0', 'ip')).toBeNull();
    });

    it('should accept IP with CIDR notation', () => {
      expect(validators.ipAddress('192.168.1.0/24', 'ip')).toBeNull();
      expect(validators.ipAddress('10.0.0.0/8', 'ip')).toBeNull();
    });

    it('should reject invalid IP addresses', () => {
      expect(validators.ipAddress('256.1.1.1', 'ip')).not.toBeNull();
      expect(validators.ipAddress('192.168.1', 'ip')).not.toBeNull();
      expect(validators.ipAddress('192.168.1.1.1', 'ip')).not.toBeNull();
      expect(validators.ipAddress('not.an.ip', 'ip')).not.toBeNull();
    });

    it('should reject invalid CIDR notation', () => {
      expect(validators.ipAddress('192.168.1.0/33', 'ip')).not.toBeNull();
      expect(validators.ipAddress('192.168.1.0/-1', 'ip')).not.toBeNull();
    });
  });

  describe('hostname validator', () => {
    it('should accept valid hostnames', () => {
      expect(validators.hostname('h2o-tower.local', 'hostname')).toBeNull();
      expect(validators.hostname('example.com', 'hostname')).toBeNull();
      expect(validators.hostname('my-device', 'hostname')).toBeNull();
    });

    it('should reject invalid hostnames', () => {
      expect(validators.hostname('invalid..hostname', 'hostname')).not.toBeNull();
      expect(validators.hostname('-invalid', 'hostname')).not.toBeNull();
      expect(validators.hostname('invalid-', 'hostname')).not.toBeNull();
      expect(validators.hostname('', 'hostname')).not.toBeNull();
    });
  });

  describe('url validator', () => {
    it('should accept valid URLs', () => {
      expect(validators.url('https://example.com', 'url')).toBeNull();
      expect(validators.url('http://192.168.1.100:8443', 'url')).toBeNull();
      expect(validators.url('https://h2o-tower.local:8443', 'url')).toBeNull();
    });

    it('should reject invalid URLs', () => {
      expect(validators.url('not a url', 'url')).not.toBeNull();
      expect(validators.url('http://', 'url')).not.toBeNull();
      expect(validators.url('example.com', 'url')).not.toBeNull();
    });
  });

  describe('port validator', () => {
    it('should accept valid port numbers', () => {
      expect(validators.port('8443', 'port')).toBeNull();
      expect(validators.port('80', 'port')).toBeNull();
      expect(validators.port('65535', 'port')).toBeNull();
      expect(validators.port('1', 'port')).toBeNull();
    });

    it('should reject invalid port numbers', () => {
      expect(validators.port('0', 'port')).not.toBeNull();
      expect(validators.port('65536', 'port')).not.toBeNull();
      expect(validators.port('-1', 'port')).not.toBeNull();
      expect(validators.port('not-a-port', 'port')).not.toBeNull();
    });
  });

  describe('pwmDuty validator', () => {
    it('should accept valid PWM duty cycles', () => {
      expect(validators.pwmDuty('0', 'pwm')).toBeNull();
      expect(validators.pwmDuty('500', 'pwm')).toBeNull();
      expect(validators.pwmDuty('1000', 'pwm')).toBeNull();
    });

    it('should reject invalid PWM duty cycles', () => {
      expect(validators.pwmDuty('-1', 'pwm')).not.toBeNull();
      expect(validators.pwmDuty('1001', 'pwm')).not.toBeNull();
      expect(validators.pwmDuty('not-a-number', 'pwm')).not.toBeNull();
    });
  });

  describe('gpioState validator', () => {
    it('should accept valid GPIO states', () => {
      expect(validators.gpioState('0', 'gpio')).toBeNull();
      expect(validators.gpioState('1', 'gpio')).toBeNull();
    });

    it('should reject invalid GPIO states', () => {
      expect(validators.gpioState('2', 'gpio')).not.toBeNull();
      expect(validators.gpioState('-1', 'gpio')).not.toBeNull();
      expect(validators.gpioState('true', 'gpio')).not.toBeNull();
    });
  });

  describe('range validator', () => {
    it('should accept values within range', () => {
      expect(validators.range('5', 0, 10, 'num')).toBeNull();
      expect(validators.range('0', 0, 10, 'num')).toBeNull();
      expect(validators.range('10', 0, 10, 'num')).toBeNull();
    });

    it('should reject values outside range', () => {
      expect(validators.range('-1', 0, 10, 'num')).not.toBeNull();
      expect(validators.range('11', 0, 10, 'num')).not.toBeNull();
    });
  });

  describe('pipelineName validator', () => {
    it('should accept valid pipeline names', () => {
      expect(validators.pipelineName('Mist Cycle', 'name')).toBeNull();
      expect(validators.pipelineName('pump-control', 'name')).toBeNull();
      expect(validators.pipelineName('water_level_check', 'name')).toBeNull();
      expect(validators.pipelineName('A', 'name')).toBeNull();
    });

    it('should reject invalid pipeline names', () => {
      expect(validators.pipelineName('', 'name')).not.toBeNull();
      expect(validators.pipelineName('a'.repeat(51), 'name')).not.toBeNull();
      expect(validators.pipelineName('invalid@name', 'name')).not.toBeNull();
    });
  });

  describe('pinNumber validator', () => {
    it('should accept valid GPIO pin numbers (ESP32-C3)', () => {
      expect(validators.pinNumber('0', 'pin')).toBeNull();
      expect(validators.pinNumber('10', 'pin')).toBeNull();
      expect(validators.pinNumber('21', 'pin')).toBeNull();
    });

    it('should reject invalid GPIO pin numbers', () => {
      expect(validators.pinNumber('-1', 'pin')).not.toBeNull();
      expect(validators.pinNumber('22', 'pin')).not.toBeNull();
      expect(validators.pinNumber('not-a-pin', 'pin')).not.toBeNull();
    });
  });
});

describe('Form Validators - Combined Tests', () => {
  describe('deviceIp form validator', () => {
    it('should validate valid device IP', () => {
      const result = formValidators.deviceIp('192.168.1.100');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty IP', () => {
      const result = formValidators.deviceIp('');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid IP format', () => {
      const result = formValidators.deviceIp('not.an.ip');
      expect(result.isValid).toBe(false);
    });
  });

  describe('port form validator', () => {
    it('should validate valid port', () => {
      const result = formValidators.port('8443');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid port', () => {
      const result = formValidators.port('99999');
      expect(result.isValid).toBe(false);
    });
  });

  describe('pipelineName form validator', () => {
    it('should validate valid pipeline name', () => {
      const result = formValidators.pipelineName('My Pipeline');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty pipeline name', () => {
      const result = formValidators.pipelineName('');
      expect(result.isValid).toBe(false);
    });
  });
});

describe('Validation Helper Functions', () => {
  describe('getErrorMessage', () => {
    it('should format single error', () => {
      const errors = [{ field: 'ip', message: 'Invalid IP', type: 'format' }];
      const msg = getErrorMessage(errors);
      expect(msg).toContain('Invalid IP');
    });

    it('should format multiple errors', () => {
      const errors = [
        { field: 'ip', message: 'Invalid IP', type: 'format' },
        { field: 'port', message: 'Invalid port', type: 'range' },
      ];
      const msg = getErrorMessage(errors);
      expect(msg).toContain('Invalid IP');
      expect(msg).toContain('Invalid port');
    });

    it('should handle empty errors', () => {
      const msg = getErrorMessage([]);
      expect(msg).toBe('No errors');
    });
  });

  describe('hasErrors', () => {
    it('should return true if errors exist', () => {
      const errorObj = { field1: [{ field: 'field1', message: 'Error', type: 'required' }] };
      expect(hasErrors(errorObj)).toBe(true);
    });

    it('should return false if no errors', () => {
      expect(hasErrors({})).toBe(false);
    });
  });

  describe('getFieldError', () => {
    it('should return first error for field', () => {
      const errors = {
        email: [
          { field: 'email', message: 'Invalid email', type: 'format' },
          { field: 'email', message: 'Email taken', type: 'invalid' },
        ],
      };
      const error = getFieldError(errors, 'email');
      expect(error?.message).toBe('Invalid email');
    });

    it('should return null if no errors for field', () => {
      const errors = { otherField: [] };
      const error = getFieldError(errors, 'email');
      expect(error).toBeNull();
    });
  });
});
