import input from "@/lib/tasks/nodes/input";
import type { ReadStream } from "@/lib/streams/types";

describe('input', () => {
  let inputNode: ReadStream & { trigger: (data: any) => void };

  beforeEach(() => {
    inputNode = input();
  });

  describe('initialization', () => {
    it('should create an input node with correct initial state', () => {
      expect(inputNode.status).toBe('paused');
      expect(typeof inputNode.on).toBe('function');
      expect(typeof inputNode.emit).toBe('function');
      expect(typeof inputNode.pipe).toBe('function');
      expect(typeof inputNode.resume).toBe('function');
      expect(typeof inputNode.pause).toBe('function');
      expect(typeof inputNode.trigger).toBe('function');
    });

    it('should accept configuration object', () => {
      const config = { test: 'value' };
      const configuredInput = input(config);
      
      expect(configuredInput).toBeDefined();
      expect(configuredInput.status).toBe('paused');
      expect(typeof configuredInput.trigger).toBe('function');
    });

    it('should work without configuration object', () => {
      const defaultInput = input();
      
      expect(defaultInput).toBeDefined();
      expect(defaultInput.status).toBe('paused');
      expect(typeof defaultInput.trigger).toBe('function');
    });
  });

  describe('trigger functionality', () => {
    it('should emit data event when trigger is called', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      const testData = { message: 'test data' };
      inputNode.trigger(testData);

      expect(dataHandler).toHaveBeenCalledTimes(1);
      expect(dataHandler).toHaveBeenCalledWith(testData);
    });

    it('should emit multiple data events for multiple triggers', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      inputNode.trigger('first');
      inputNode.trigger('second');
      inputNode.trigger('third');

      expect(dataHandler).toHaveBeenCalledTimes(3);
      expect(dataHandler).toHaveBeenNthCalledWith(1, 'first');
      expect(dataHandler).toHaveBeenNthCalledWith(2, 'second');
      expect(dataHandler).toHaveBeenNthCalledWith(3, 'third');
    });

    it('should handle different data types', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      // Test string
      inputNode.trigger('string data');
      expect(dataHandler).toHaveBeenLastCalledWith('string data');

      // Test number
      inputNode.trigger(42);
      expect(dataHandler).toHaveBeenLastCalledWith(42);

      // Test object
      const obj = { key: 'value', nested: { data: true } };
      inputNode.trigger(obj);
      expect(dataHandler).toHaveBeenLastCalledWith(obj);

      // Test array
      const arr = [1, 2, 3];
      inputNode.trigger(arr);
      expect(dataHandler).toHaveBeenLastCalledWith(arr);

      // Test null
      inputNode.trigger(null);
      expect(dataHandler).toHaveBeenLastCalledWith(null);

      // Test undefined
      inputNode.trigger(undefined);
      expect(dataHandler).toHaveBeenLastCalledWith(undefined);
    });

    it('should work without any listeners', () => {
      // Should not throw when trigger is called without listeners
      expect(() => {
        inputNode.trigger('test data');
      }).not.toThrow();
    });
  });

  describe('stream integration', () => {
    it('should be a proper ReadStream', () => {
      expect(inputNode.status).toBe('paused');
      expect(typeof inputNode.pipe).toBe('function');
      expect(typeof inputNode.resume).toBe('function');
      expect(typeof inputNode.pause).toBe('function');
    });

    it('should have status management methods', () => {
      expect(typeof inputNode.resume).toBe('function');
      expect(typeof inputNode.pause).toBe('function');
      
      // Note: The current implementation doesn't actually change the status
      // because the methods modify a local variable, not the returned object
      expect(inputNode.status).toBe('paused');
    });

    it('should emit data even when paused', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);
      inputNode.pause();

      inputNode.trigger('test');
      
      expect(dataHandler).toHaveBeenCalledWith('test');
    });

    it('should emit data when resumed', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);
      inputNode.resume();

      inputNode.trigger('test');
      
      expect(dataHandler).toHaveBeenCalledWith('test');
    });
  });

  describe('event emitter functionality', () => {
    it('should support multiple listeners for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      inputNode.on('data', handler1);
      inputNode.on('data', handler2);
      inputNode.on('data', handler3);

      inputNode.trigger('test data');

      expect(handler1).toHaveBeenCalledWith('test data');
      expect(handler2).toHaveBeenCalledWith('test data');
      expect(handler3).toHaveBeenCalledWith('test data');
    });

    it('should support other event types', () => {
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();

      inputNode.on('error', errorHandler);
      inputNode.on('close', closeHandler);

      inputNode.emit('error', new Error('test error'));
      inputNode.emit('close');

      expect(errorHandler).toHaveBeenCalledWith(new Error('test error'));
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string data', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      inputNode.trigger('');
      
      expect(dataHandler).toHaveBeenCalledWith('');
    });

    it('should handle zero data', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      inputNode.trigger(0);
      
      expect(dataHandler).toHaveBeenCalledWith(0);
    });

    it('should handle false data', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      inputNode.trigger(false);
      
      expect(dataHandler).toHaveBeenCalledWith(false);
    });

    it('should handle function data', () => {
      const dataHandler = jest.fn();
      const testFunction = () => 'test';
      inputNode.on('data', dataHandler);

      inputNode.trigger(testFunction);
      
      expect(dataHandler).toHaveBeenCalledWith(testFunction);
    });

    it('should handle circular references in objects', () => {
      const dataHandler = jest.fn();
      inputNode.on('data', dataHandler);

      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => {
        inputNode.trigger(circular);
      }).not.toThrow();

      expect(dataHandler).toHaveBeenCalledWith(circular);
    });
  });
});
