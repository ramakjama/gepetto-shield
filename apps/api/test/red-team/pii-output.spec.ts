import { describe, it, expect } from 'vitest';
import { PiiScannerService } from '../../src/output/pii-scanner.service';

const pii = new PiiScannerService();

describe('PII Output Scanning', () => {
  describe('NIF detection', () => {
    it('should detect and redact NIF', () => {
      const text = 'El cliente con NIF 12345678A tiene una póliza activa';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(true);
      expect(result.text).not.toContain('12345678A');
      expect(result.text).toContain('****78A');
    });
  });

  describe('NIE detection', () => {
    it('should detect and redact NIE', () => {
      const text = 'El asegurado X1234567B contactó ayer';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(true);
      expect(result.text).not.toContain('X1234567B');
    });
  });

  describe('IBAN detection', () => {
    it('should detect and redact IBAN', () => {
      const text = 'Domiciliación en ES12 3456 7890 1234 5678 9012';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(true);
      expect(result.text).not.toContain('3456 7890');
    });
  });

  describe('Phone detection', () => {
    it('should detect and redact phone numbers', () => {
      const text = 'Contacto: 612 345 678';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(true);
      expect(result.text).not.toContain('612 345');
    });
  });

  describe('Email detection', () => {
    it('should detect and redact email', () => {
      const text = 'Enviar a maria.sanchez@ejemplo.com';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(true);
      expect(result.text).toContain('m***@ejemplo.com');
    });
  });

  describe('Clean text should pass through', () => {
    it('should not flag normal insurance text', () => {
      const text = 'La póliza tiene cobertura de incendio con franquicia de 300 euros.';
      const result = pii.redact(text);
      expect(result.piiDetected).toBe(false);
      expect(result.text).toBe(text);
    });
  });
});
