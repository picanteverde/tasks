import output from "@/lib/tasks/nodes/output";
import type { WriteStream } from "@/lib/streams/types";

describe('output', () => {
  let outputNode: WriteStream & { addListener: (listener: (data: any) => void) => void };

  beforeEach(() => {
    outputNode = output();
  });

  describe('initialization', () => {
    it('should create an output node with correct initial state', () => {
      expect(outputNode.status).toBe('open');
      expect(typeof outputNode.on).toBe('function');
      expect(typeof outputNode.emit).toBe('function');
      expect(typeof outputNode.write).toBe('function');
      expect(typeof outputNode.end).toBe('function');
      expect(typeof outputNode.addListener).toBe('function');
    });

    it('should accept configuration object', () => {
      const config = { test: 'value', timeout: 5000 };
      const configuredOutput = output(config);
      
      expect(configuredOutput).toBeDefined();
      expect(configuredOutput.status).toBe('open');
      expect(typeof configuredOutput.addListener).toBe('function');
      expect(typeof configuredOutput.write).toBe('function');
    });

    it('should work without configuration object', () => {
      const defaultOutput = output();
      
      expect(defaultOutput).toBeDefined();
      expect(defaultOutput.status).toBe('open');
      expect(typeof defaultOutput.addListener).toBe('function');
      expect(typeof defaultOutput.write).toBe('function');
    });
  });

  describe('addListener functionality', () => {
    it('should add a listener that receives data events', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      const testData = { message: 'test data' };
      outputNode.write(testData);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      outputNode.addListener(listener1);
      outputNode.addListener(listener2);
      outputNode.addListener(listener3);

      const testData = 'test message';
      outputNode.write(testData);

      expect(listener1).toHaveBeenCalledWith(testData);
      expect(listener2).toHaveBeenCalledWith(testData);
      expect(listener3).toHaveBeenCalledWith(testData);
    });

    it('should call all listeners for multiple write operations', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      outputNode.write('first');
      outputNode.write('second');
      outputNode.write('third');

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, 'first');
      expect(listener).toHaveBeenNthCalledWith(2, 'second');
      expect(listener).toHaveBeenNthCalledWith(3, 'third');
    });

    it('should handle different data types', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      // Test string
      outputNode.write('string data');
      expect(listener).toHaveBeenLastCalledWith('string data');

      // Test number
      outputNode.write(42);
      expect(listener).toHaveBeenLastCalledWith(42);

      // Test object
      const obj = { key: 'value', nested: { data: true } };
      outputNode.write(obj);
      expect(listener).toHaveBeenLastCalledWith(obj);

      // Test array
      const arr = [1, 2, 3];
      outputNode.write(arr);
      expect(listener).toHaveBeenLastCalledWith(arr);

      // Test null
      outputNode.write(null);
      expect(listener).toHaveBeenLastCalledWith(null);

      // Test undefined
      outputNode.write(undefined);
      expect(listener).toHaveBeenLastCalledWith(undefined);

      // Test boolean
      outputNode.write(true);
      expect(listener).toHaveBeenLastCalledWith(true);
    });
  });

  describe('WriteStream integration', () => {
    it('should be a proper WriteStream', () => {
      expect(outputNode.status).toBe('open');
      expect(typeof outputNode.write).toBe('function');
      expect(typeof outputNode.end).toBe('function');
      expect(typeof outputNode.on).toBe('function');
      expect(typeof outputNode.emit).toBe('function');
    });

    it('should emit data events when write is called', () => {
      const dataHandler = jest.fn();
      outputNode.on('data', dataHandler);

      const testData = 'test data';
      outputNode.write(testData);

      expect(dataHandler).toHaveBeenCalledWith(testData);
    });

    it('should emit close events when end is called', () => {
      const closeHandler = jest.fn();
      outputNode.on('close', closeHandler);

      outputNode.end();

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should support direct event emission', () => {
      const customHandler = jest.fn();
      outputNode.on('custom', customHandler);

      outputNode.emit('custom', 'custom data');

      expect(customHandler).toHaveBeenCalledWith('custom data');
    });
  });

  describe('event emitter functionality', () => {
    it('should support multiple listeners for different events', () => {
      const dataHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();

      outputNode.on('data', dataHandler);
      outputNode.on('error', errorHandler);
      outputNode.on('close', closeHandler);

      outputNode.write('test data');
      outputNode.emit('error', new Error('test error'));
      outputNode.end();

      expect(dataHandler).toHaveBeenCalledWith('test data');
      expect(errorHandler).toHaveBeenCalledWith(new Error('test error'));
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple listeners for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      outputNode.on('data', handler1);
      outputNode.on('data', handler2);
      outputNode.on('data', handler3);

      outputNode.write('test data');

      expect(handler1).toHaveBeenCalledWith('test data');
      expect(handler2).toHaveBeenCalledWith('test data');
      expect(handler3).toHaveBeenCalledWith('test data');
    });

    it('should work with addListener and direct on calls', () => {
      const addListenerHandler = jest.fn();
      const directHandler = jest.fn();

      outputNode.addListener(addListenerHandler);
      outputNode.on('data', directHandler);

      outputNode.write('test data');

      expect(addListenerHandler).toHaveBeenCalledWith('test data');
      expect(directHandler).toHaveBeenCalledWith('test data');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string data', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      outputNode.write('');
      
      expect(listener).toHaveBeenCalledWith('');
    });

    it('should handle zero data', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      outputNode.write(0);
      
      expect(listener).toHaveBeenCalledWith(0);
    });

    it('should handle false data', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      outputNode.write(false);
      
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('should handle function data', () => {
      const listener = jest.fn();
      const testFunction = () => 'test';
      outputNode.addListener(listener);

      outputNode.write(testFunction);
      
      expect(listener).toHaveBeenCalledWith(testFunction);
    });

    it('should handle circular references in objects', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not throw
      expect(() => {
        outputNode.write(circular);
      }).not.toThrow();

      expect(listener).toHaveBeenCalledWith(circular);
    });

    it('should handle large objects', () => {
      const listener = jest.fn();
      outputNode.addListener(listener);

      const largeObject = {
        array: new Array(1000).fill(0).map((_, i) => i),
        nested: {
          deep: {
            data: 'test',
            numbers: [1, 2, 3, 4, 5]
          }
        }
      };

      outputNode.write(largeObject);
      
      expect(listener).toHaveBeenCalledWith(largeObject);
    });

    it('should handle no listeners gracefully', () => {
      // Should not throw when write is called without listeners
      expect(() => {
        outputNode.write('test data');
        outputNode.end();
      }).not.toThrow();
    });

    it('should handle listeners that throw errors', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      outputNode.addListener(errorListener);
      outputNode.addListener(normalListener);

      // Should not throw and other listeners should still be called
      expect(() => {
        outputNode.write('test data');
      }).not.toThrow();

      expect(normalListener).toHaveBeenCalledWith('test data');
      expect(errorListener).toHaveBeenCalledWith('test data');
    });
  });

  describe('integration scenarios', () => {
    it('should work as a data sink', () => {
      const results: any[] = [];
      const listener = (data: any) => results.push(data);
      
      outputNode.addListener(listener);

      outputNode.write('first');
      outputNode.write({ id: 1, name: 'test' });
      outputNode.write([1, 2, 3]);
      outputNode.end();

      expect(results).toEqual([
        'first',
        { id: 1, name: 'test' },
        [1, 2, 3]
      ]);
    });

    it('should support data transformation', () => {
      const transformedResults: string[] = [];
      const listener = (data: any) => {
        transformedResults.push(`transformed: ${JSON.stringify(data)}`);
      };
      
      outputNode.addListener(listener);

      outputNode.write('hello');
      outputNode.write({ message: 'world' });
      outputNode.write(42);

      expect(transformedResults).toEqual([
        'transformed: "hello"',
        'transformed: {"message":"world"}',
        'transformed: 42'
      ]);
    });
  });
});
