import writeStream from '../../../src/lib/streams/writeStream';
import readStream from '../../../src/lib/streams/readStream';
import type { WriteStream } from '../../../src/lib/streams/types';

describe('writeStream', () => {
  let ws: WriteStream;

  beforeEach(() => {
    ws = writeStream();
  });

  describe('initialization', () => {
    it('should create a writeStream with correct initial state', () => {
      expect(ws.status).toBe('open');
      expect(typeof ws.on).toBe('function');
      expect(typeof ws.emit).toBe('function');
      expect(typeof ws.write).toBe('function');
      expect(typeof ws.end).toBe('function');
    });

    it('should be an EventEmitter', () => {
      const dataHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();

      ws.on('data', dataHandler);
      ws.on('error', errorHandler);
      ws.on('close', closeHandler);

      ws.emit('data', 'test data');
      ws.emit('error', new Error('test error'));
      ws.emit('close');

      expect(dataHandler).toHaveBeenCalledWith('test data');
      expect(errorHandler).toHaveBeenCalledWith(new Error('test error'));
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('write method', () => {
    it('should emit data events when write is called', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      ws.write('test data');

      expect(dataHandler).toHaveBeenCalledWith('test data');
    });

    it('should handle multiple write calls', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      ws.write('data1');
      ws.write('data2');
      ws.write('data3');

      expect(dataHandler).toHaveBeenCalledTimes(3);
      expect(dataHandler).toHaveBeenNthCalledWith(1, 'data1');
      expect(dataHandler).toHaveBeenNthCalledWith(2, 'data2');
      expect(dataHandler).toHaveBeenNthCalledWith(3, 'data3');
    });

    it('should handle different data types', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      // Test string
      ws.write('hello');
      expect(dataHandler).toHaveBeenLastCalledWith('hello');

      // Test number
      ws.write(42);
      expect(dataHandler).toHaveBeenLastCalledWith(42);

      // Test boolean
      ws.write(true);
      expect(dataHandler).toHaveBeenLastCalledWith(true);

      // Test null
      ws.write(null);
      expect(dataHandler).toHaveBeenLastCalledWith(null);

      // Test undefined
      ws.write(undefined);
      expect(dataHandler).toHaveBeenLastCalledWith(undefined);
    });

    it('should handle complex data types', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      // Test array
      const arrayData = [1, 2, 3];
      ws.write(arrayData);
      expect(dataHandler).toHaveBeenLastCalledWith(arrayData);

      // Test object
      const objectData = { key: 'value', nested: { prop: 123 } };
      ws.write(objectData);
      expect(dataHandler).toHaveBeenLastCalledWith(objectData);

      // Test function
      const functionData = () => 'test';
      ws.write(functionData);
      expect(dataHandler).toHaveBeenLastCalledWith(functionData);
    });

    it('should handle empty data', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      ws.write('');
      expect(dataHandler).toHaveBeenCalledWith('');
    });

    it('should work with multiple listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      ws.on('data', handler1);
      ws.on('data', handler2);
      ws.on('data', handler3);

      ws.write('test data');

      expect(handler1).toHaveBeenCalledWith('test data');
      expect(handler2).toHaveBeenCalledWith('test data');
      expect(handler3).toHaveBeenCalledWith('test data');
    });

    it('should handle rapid successive writes', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);

      // Write many times rapidly
      for (let i = 0; i < 100; i++) {
        ws.write(`data-${i}`);
      }

      expect(dataHandler).toHaveBeenCalledTimes(100);
      expect(dataHandler).toHaveBeenLastCalledWith('data-99');
    });

    it('should not change status when writing', () => {
      expect(ws.status).toBe('open');
      
      ws.write('test data');
      
      expect(ws.status).toBe('open');
    });
  });

  describe('end method', () => {
    it('should emit close event when end is called', () => {
      const closeHandler = jest.fn();
      ws.on('close', closeHandler);

      ws.end();

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should work with multiple close listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      ws.on('close', handler1);
      ws.on('close', handler2);
      ws.on('close', handler3);

      ws.end();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple end calls', () => {
      const closeHandler = jest.fn();
      ws.on('close', closeHandler);

      ws.end();
      ws.end();
      ws.end();

      expect(closeHandler).toHaveBeenCalledTimes(3);
    });

    it('should not change status when ending', () => {
      expect(ws.status).toBe('open');
      
      ws.end();
      
      expect(ws.status).toBe('open');
    });

    it('should not prevent write operations after end', () => {
      const dataHandler = jest.fn();
      const closeHandler = jest.fn();

      ws.on('data', dataHandler);
      ws.on('close', closeHandler);

      ws.end();
      ws.write('data after end');

      expect(closeHandler).toHaveBeenCalledTimes(1);
      expect(dataHandler).toHaveBeenCalledWith('data after end');
    });
  });

  describe('status management', () => {
    it('should start with open status', () => {
      expect(ws.status).toBe('open');
    });

    it('should maintain open status throughout operations', () => {
      expect(ws.status).toBe('open');
      
      ws.write('data');
      expect(ws.status).toBe('open');
      
      ws.end();
      expect(ws.status).toBe('open');
    });

    it('should allow manual status changes via emit', () => {
      // This tests that the status property can be modified
      // (though the implementation doesn't provide methods for this)
      ws.status = 'paused';
      expect(ws.status).toBe('paused');
      
      ws.status = 'error';
      expect(ws.status).toBe('error');
      
      ws.status = 'closed';
      expect(ws.status).toBe('closed');
    });
  });

  describe('event handling', () => {
    it('should emit and handle data events', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      ws.emit('data', 'test data');
      
      expect(dataHandler).toHaveBeenCalledWith('test data');
    });

    it('should emit and handle error events', () => {
      const errorHandler = jest.fn();
      ws.on('error', errorHandler);
      
      const testError = new Error('stream error');
      ws.emit('error', testError);
      
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should emit and handle close events', () => {
      const closeHandler = jest.fn();
      ws.on('close', closeHandler);
      
      ws.emit('close');
      
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for different events', () => {
      const dataHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();
      
      ws.on('data', dataHandler);
      ws.on('error', errorHandler);
      ws.on('close', closeHandler);
      
      ws.emit('data', 'test data');
      ws.emit('error', new Error('test error'));
      ws.emit('close');
      
      expect(dataHandler).toHaveBeenCalledWith('test data');
      expect(errorHandler).toHaveBeenCalledWith(new Error('test error'));
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle listeners for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      ws.on('data', handler1);
      ws.on('data', handler2);
      
      ws.emit('data', 'test data');
      
      expect(handler1).toHaveBeenCalledWith('test data');
      expect(handler2).toHaveBeenCalledWith('test data');
    });
  });

  describe('integration with readStream', () => {
    it('should work when piped from a readStream', () => {
      // Import readStream for integration test
      
      const rs = readStream();
      
      const dataHandler = jest.fn();
      const closeHandler = jest.fn();
      
      ws.on('data', dataHandler);
      ws.on('close', closeHandler);
      
      // Pipe readStream to writeStream
      rs.pipe(ws);
      
      // Emit events from readStream
      rs.emit('data', 'piped data');
      rs.emit('close');
      
      expect(dataHandler).toHaveBeenCalledWith('piped data');
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle error forwarding from readStream', () => {
      const rs = readStream();
      
      const errorHandler = jest.fn();
      ws.on('error', errorHandler);
      
      rs.pipe(ws);
      
      const testError = new Error('piped error');
      rs.emit('error', testError);
      
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should handle multiple data events from readStream', () => {
      const rs = readStream();
      
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      rs.pipe(ws);
      
      // Emit multiple data events
      rs.emit('data', 'data1');
      rs.emit('data', 'data2');
      rs.emit('data', 'data3');
      
      expect(dataHandler).toHaveBeenCalledTimes(3);
      expect(dataHandler).toHaveBeenNthCalledWith(1, 'data1');
      expect(dataHandler).toHaveBeenNthCalledWith(2, 'data2');
      expect(dataHandler).toHaveBeenNthCalledWith(3, 'data3');
    });
  });

  describe('edge cases', () => {
    it('should handle very large data', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      const largeData = 'x'.repeat(100000); // 100KB string
      ws.write(largeData);
      
      expect(dataHandler).toHaveBeenCalledWith(largeData);
    });

    it('should handle special characters in data', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      const specialData = 'Hello 世界! 🌍\n\t\r';
      ws.write(specialData);
      
      expect(dataHandler).toHaveBeenCalledWith(specialData);
    });

    it('should handle circular references in objects', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      const circularData: any = { name: 'test' };
      circularData.self = circularData;
      
      ws.write(circularData);
      
      expect(dataHandler).toHaveBeenCalledWith(circularData);
    });

    it('should handle errors in event handlers gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();
      const errorListener = jest.fn();
      
      ws.on('data', errorHandler);
      ws.on('data', normalHandler);
      ws.on('error', errorListener);
      
      // This should not crash the stream
      ws.write('test');
      
      expect(errorListener).toHaveBeenCalledTimes(1);
      // The second handler should still be called
      expect(normalHandler).toHaveBeenCalledWith('test');
    });

    it('should handle mixed write and end operations', () => {
      const dataHandler = jest.fn();
      const closeHandler = jest.fn();
      
      ws.on('data', dataHandler);
      ws.on('close', closeHandler);
      
      ws.write('data1');
      ws.end();
      ws.write('data2');
      ws.end();
      ws.write('data3');
      
      expect(dataHandler).toHaveBeenCalledTimes(3);
      expect(dataHandler).toHaveBeenNthCalledWith(1, 'data1');
      expect(dataHandler).toHaveBeenNthCalledWith(2, 'data2');
      expect(dataHandler).toHaveBeenNthCalledWith(3, 'data3');
      
      expect(closeHandler).toHaveBeenCalledTimes(2);
    });

    it('should handle write operations with no listeners', () => {
      // Should not throw when no listeners are registered
      expect(() => {
        ws.write('test data');
      }).not.toThrow();
    });

    it('should handle end operations with no listeners', () => {
      // Should not throw when no listeners are registered
      expect(() => {
        ws.end();
      }).not.toThrow();
    });
  });

  describe('performance and stress tests', () => {
    it('should handle a large number of rapid write operations', () => {
      const dataHandler = jest.fn();
      ws.on('data', dataHandler);
      
      const startTime = Date.now();
      
      // Write 1000 times rapidly
      for (let i = 0; i < 1000; i++) {
        ws.write(`data-${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(dataHandler).toHaveBeenCalledTimes(1000);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should handle concurrent write and end operations', () => {
      const dataHandler = jest.fn();
      const closeHandler = jest.fn();
      
      ws.on('data', dataHandler);
      ws.on('close', closeHandler);
      
      // Mix write and end operations
      ws.write('data1');
      ws.end();
      ws.write('data2');
      ws.write('data3');
      ws.end();
      ws.write('data4');
      
      expect(dataHandler).toHaveBeenCalledTimes(4);
      expect(closeHandler).toHaveBeenCalledTimes(2);
    });
  });
});
