/**
 * hooks/useFormValidation.ts
 * React hook for form state and validation
 */

import { useState, useCallback } from 'react';
import type { ValidationError } from '../utils/validation';
import { getFieldError, hasErrors } from '../utils/validation';

export interface FormState<T> {
  values: T;
  errors: Record<string, ValidationError[]>;
  touched: Record<string, boolean>;
  isSubmitting: boolean;
  submitCount: number;
}

interface UseFormValidationOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void>;
  validate?: (values: T) => Record<string, ValidationError[]>;
}

export const useFormValidation = <T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
}: UseFormValidationOptions<T>) => {
  const [formState, setFormState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    touched: {},
    isSubmitting: false,
    submitCount: 0,
  });

  /**
   * Handle field change
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value, type } = e.target;
      const fieldValue = type === 'number' ? (value === '' ? '' : Number(value)) : value;

      setFormState((prev) => ({
        ...prev,
        values: {
          ...prev.values,
          [name]: fieldValue,
        },
      }));
    },
    []
  );

  /**
   * Handle field blur (mark as touched)
   */
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name } = e.target;

      setFormState((prev) => ({
        ...prev,
        touched: {
          ...prev.touched,
          [name]: true,
        },
      }));

      // Validate this field
      if (validate) {
        const allErrors = validate(formState.values);
        setFormState((prev) => ({
          ...prev,
          errors: {
            ...prev.errors,
            [name]: allErrors[name] || [],
          },
        }));
      }
    },
    [formState.values, validate]
  );

  /**
   * Validate entire form
   */
  const validateForm = useCallback((): boolean => {
    if (!validate) return true;

    const errors = validate(formState.values);
    setFormState((prev) => ({
      ...prev,
      errors,
    }));

    return !hasErrors(errors);
  }, [formState.values, validate]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Mark all fields as touched
      const allTouched = Object.keys(formState.values).reduce(
        (acc, key) => {
          acc[key] = true;
          return acc;
        },
        {} as Record<string, boolean>
      );

      setFormState((prev) => ({
        ...prev,
        touched: allTouched,
        submitCount: prev.submitCount + 1,
      }));

      // Validate form
      if (!validateForm()) {
        return;
      }

      // Submit
      setFormState((prev) => ({
        ...prev,
        isSubmitting: true,
      }));

      try {
        await onSubmit(formState.values);
        // Reset form on success
        setFormState({
          values: initialValues,
          errors: {},
          touched: {},
          isSubmitting: false,
          submitCount: 0,
        });
      } catch (error) {
        console.error('Form submission error:', error);
        setFormState((prev) => ({
          ...prev,
          isSubmitting: false,
          errors: {
            ...prev.errors,
            _submit: [
              {
                field: '_submit',
                message: error instanceof Error ? error.message : 'Form submission failed',
                type: 'network',
              },
            ],
          },
        }));
      }
    },
    [formState.values, initialValues, validateForm, onSubmit]
  );

  /**
   * Reset form to initial state
   */
  const resetForm = useCallback(() => {
    setFormState({
      values: initialValues,
      errors: {},
      touched: {},
      isSubmitting: false,
      submitCount: 0,
    });
  }, [initialValues]);

  /**
   * Set field value programmatically
   */
  const setFieldValue = useCallback((name: string, value: any) => {
    setFormState((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [name]: value,
      },
    }));
  }, []);

  /**
   * Set field error manually
   */
  const setFieldError = useCallback((name: string, error: ValidationError[]) => {
    setFormState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [name]: error,
      },
    }));
  }, []);

  /**
   * Get error message for a field
   */
  const getFieldErrorMessage = useCallback(
    (fieldName: string): string => {
      return getFieldError(formState.errors, fieldName);
    },
    [formState.errors]
  );

  /**
   * Check if a field has been touched and has errors
   */
  const getFieldStatus = useCallback(
    (fieldName: string): 'error' | 'success' | null => {
      const isTouched = formState.touched[fieldName];
      const hasError = (formState.errors[fieldName] || []).length > 0;

      if (!isTouched) return null;
      return hasError ? 'error' : 'success';
    },
    [formState.touched, formState.errors]
  );

  return {
    // Form state
    values: formState.values,
    errors: formState.errors,
    touched: formState.touched,
    isSubmitting: formState.isSubmitting,
    submitCount: formState.submitCount,
    isDirty: JSON.stringify(formState.values) !== JSON.stringify(initialValues),
    isValid: !hasErrors(formState.errors),

    // Handlers
    handleChange,
    handleBlur,
    handleSubmit,

    // Methods
    resetForm,
    setFieldValue,
    setFieldError,
    getFieldErrorMessage,
    getFieldStatus,
    validateForm,
  };
};
