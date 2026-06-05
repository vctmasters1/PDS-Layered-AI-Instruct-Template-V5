import { renderHook, act } from '@testing-library/react';
import { useFormValidation } from '@hooks/useFormValidation';
import { formValidators } from '@utils/validation';

interface TestFormValues {
  email: string;
  password: string;
  port: string;
}

const initialValues: TestFormValues = {
  email: '',
  password: '',
  port: '',
};

const validate = (values: TestFormValues) => {
  const errors: Record<string, any[]> = {};

  const emailErrors = formValidators.deviceIp(values.email);
  if (!emailErrors.isValid) errors.email = emailErrors.errors;

  const passwordErrors = formValidators.port(values.password);
  if (!passwordErrors.isValid) errors.password = passwordErrors.errors;

  const portErrors = formValidators.port(values.port);
  if (!portErrors.isValid) errors.port = portErrors.errors;

  return errors;
};

describe('useFormValidation Hook - Unit Tests', () => {
  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      expect(result.current.values).toEqual(initialValues);
      expect(result.current.errors).toEqual({});
      expect(result.current.touched).toEqual({});
      expect(result.current.isDirty).toBe(false);
    });

    it('should have empty initial touched fields', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      expect(Object.keys(result.current.touched)).toHaveLength(0);
    });

    it('should be valid initially with empty values', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      expect(result.current.isValid).toBe(true);
    });
  });

  describe('handleChange', () => {
    it('should update field value', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: '192.168.1.100' },
        } as any);
      });

      expect(result.current.values.email).toBe('192.168.1.100');
    });

    it('should mark form as dirty after change', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: 'new value' },
        } as any);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should handle multiple fields', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: '192.168.1.100' },
        } as any);
        result.current.handleChange({
          target: { name: 'password', value: '8443' },
        } as any);
      });

      expect(result.current.values.email).toBe('192.168.1.100');
      expect(result.current.values.password).toBe('8443');
    });
  });

  describe('handleBlur', () => {
    it('should mark field as touched', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleBlur({
          target: { name: 'email' },
        } as any);
      });

      expect(result.current.touched.email).toBe(true);
    });

    it('should validate field on blur', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'port', value: '99999' },
        } as any);
        result.current.handleBlur({
          target: { name: 'port' },
        } as any);
      });

      expect(result.current.errors.port).toBeDefined();
    });
  });

  describe('handleSubmit', () => {
    it('should call onSubmit with values when form is valid', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, onSubmit)
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: '192.168.1.100' },
        } as any);
        result.current.handleChange({
          target: { name: 'port', value: '8443' },
        } as any);
      });

      act(() => {
        result.current.handleSubmit({
          preventDefault: jest.fn(),
        } as any);
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(onSubmit).toHaveBeenCalledWith({
        email: '192.168.1.100',
        password: '',
        port: '8443',
      });
    });

    it('should not call onSubmit if form has errors', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, onSubmit)
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'port', value: '99999' },
        } as any);
      });

      act(() => {
        result.current.handleSubmit({
          preventDefault: jest.fn(),
        } as any);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should increment submit count', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, onSubmit)
      );

      expect(result.current.submitCount).toBe(0);

      act(() => {
        result.current.handleSubmit({
          preventDefault: jest.fn(),
        } as any);
      });

      expect(result.current.submitCount).toBe(1);
    });
  });

  describe('resetForm', () => {
    it('should reset values to initial state', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: '192.168.1.100' },
        } as any);
      });

      expect(result.current.values.email).toBe('192.168.1.100');

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.values).toEqual(initialValues);
    });

    it('should clear errors and touched fields', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'port', value: '99999' },
        } as any);
        result.current.handleBlur({
          target: { name: 'port' },
        } as any);
      });

      expect(Object.keys(result.current.touched)).toHaveLength(1);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.touched).toEqual({});
      expect(result.current.errors).toEqual({});
    });

    it('should reset isDirty flag', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: 'new value' },
        } as any);
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('setFieldValue', () => {
    it('should update specific field value', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.setFieldValue('email', '192.168.1.100');
      });

      expect(result.current.values.email).toBe('192.168.1.100');
    });

    it('should mark form as dirty', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.setFieldValue('email', 'new value');
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('getFieldErrorMessage', () => {
    it('should return first error message for field', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, onSubmit)
      );

      act(() => {
        result.current.setFieldError('email', [
          { field: 'email', message: 'Invalid IP', type: 'format' },
        ]);
      });

      const msg = result.current.getFieldErrorMessage('email');
      expect(msg).toBe('Invalid IP');
    });

    it('should return empty string if no error', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      const msg = result.current.getFieldErrorMessage('email');
      expect(msg).toBe('');
    });
  });

  describe('getFieldStatus', () => {
    it('should return "error" when field has errors', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.setFieldError('email', [
          { field: 'email', message: 'Error', type: 'invalid' },
        ]);
      });

      expect(result.current.getFieldStatus('email')).toBe('error');
    });

    it('should return "success" when field is touched and valid', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: '192.168.1.100' },
        } as any);
        result.current.handleBlur({
          target: { name: 'email' },
        } as any);
      });

      expect(result.current.getFieldStatus('email')).toBe('success');
    });

    it('should return null when field is untouched', () => {
      const { result } = renderHook(() =>
        useFormValidation(initialValues, validate, jest.fn())
      );

      expect(result.current.getFieldStatus('email')).toBeNull();
    });
  });
});
