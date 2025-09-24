import eventEmitter, { EventEmitter, Handler } from '../../src/lib/EventEmitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = eventEmitter();
  });

  describe('on', () => {
    it('should register a handler for an event', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      
      // Verify the handler is registered by emitting the event
      emitter.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should register multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.on('test', handler3);

      emitter.emit('test');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should register handlers for different events independently', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter.on('event1', handler1);
      emitter.on('event2', handler2);

      emitter.emit('event1');
      emitter.emit('event2');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle empty event names', () => {
      const handler = jest.fn();
      
      expect(() => {
        emitter.on('', handler);
      }).not.toThrow();

      emitter.emit('');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit', () => {
    it('should call all registered handlers with the provided data', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const testData = { message: 'hello' };

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      emitter.emit('test', testData);

      expect(handler1).toHaveBeenCalledWith(testData);
      expect(handler2).toHaveBeenCalledWith(testData);
    });

    it('should call handlers without data when no data is provided', () => {
      const handler = jest.fn();
      
      emitter.on('test', handler);
      emitter.emit('test');

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('should call handlers with undefined when data is not provided', () => {
      const handler = jest.fn();
      
      emitter.on('test', handler);
      emitter.emit('test');

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('should not throw when emitting events with no registered handlers', () => {
      expect(() => {
        emitter.emit('nonexistent');
      }).not.toThrow();
    });

    it('should not throw when emitting events with no registered handlers and data', () => {
      expect(() => {
        emitter.emit('nonexistent', { data: 'test' });
      }).not.toThrow();
    });

    it('should handle primitive data types', () => {
      const handler = jest.fn();
      emitter.on('test', handler);

      // Test string
      emitter.emit('test', 'hello');
      expect(handler).toHaveBeenLastCalledWith('hello');

      // Test number
      emitter.emit('test', 42);
      expect(handler).toHaveBeenLastCalledWith(42);

      // Test boolean
      emitter.emit('test', true);
      expect(handler).toHaveBeenLastCalledWith(true);

      // Test null
      emitter.emit('test', null);
      expect(handler).toHaveBeenLastCalledWith(null);
    });

    it('should handle complex data types', () => {
      const handler = jest.fn();
      emitter.on('test', handler);

      // Test array
      const arrayData = [1, 2, 3];
      emitter.emit('test', arrayData);
      expect(handler).toHaveBeenLastCalledWith(arrayData);

      // Test object
      const objectData = { key: 'value', nested: { prop: 123 } };
      emitter.emit('test', objectData);
      expect(handler).toHaveBeenLastCalledWith(objectData);

      // Test function
      const functionData = () => 'test';
      emitter.emit('test', functionData);
      expect(handler).toHaveBeenLastCalledWith(functionData);
    });

    it('should call handlers in the order they were registered', () => {
      const callOrder: number[] = [];
      const handler1 = jest.fn(() => callOrder.push(1));
      const handler2 = jest.fn(() => callOrder.push(2));
      const handler3 = jest.fn(() => callOrder.push(3));

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.on('test', handler3);

      emitter.emit('test');

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should handle empty event names', () => {
      const handler = jest.fn();
      
      emitter.on('', handler);
      emitter.emit('');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration tests', () => {
    it('should work with multiple events and handlers', () => {
      const userHandler = jest.fn();
      const adminHandler = jest.fn();
      const systemHandler = jest.fn();

      emitter.on('user:login', userHandler);
      emitter.on('admin:action', adminHandler);
      emitter.on('system:startup', systemHandler);

      emitter.emit('user:login', { userId: 123 });
      emitter.emit('admin:action', { action: 'delete' });
      emitter.emit('system:startup', { version: '1.0.0' });

      expect(userHandler).toHaveBeenCalledWith({ userId: 123 });
      expect(adminHandler).toHaveBeenCalledWith({ action: 'delete' });
      expect(systemHandler).toHaveBeenCalledWith({ version: '1.0.0' });
    });

    it('should maintain separate state for different emitter instances', () => {
      const emitter1 = eventEmitter();
      const emitter2 = eventEmitter();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      emitter1.on('test', handler1);
      emitter2.on('test', handler2);

      emitter1.emit('test', 'data1');
      emitter2.emit('test', 'data2');

      expect(handler1).toHaveBeenCalledWith('data1');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith('data2');
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid successive events', () => {
      const handler = jest.fn();
      emitter.on('test', handler);

      // Emit multiple events rapidly
      for (let i = 0; i < 100; i++) {
        emitter.emit('test', i);
      }

      expect(handler).toHaveBeenCalledTimes(100);
      expect(handler).toHaveBeenLastCalledWith(99);
    });

    it('should handle errors in handlers gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();
      const errorListener = jest.fn();

      emitter.on('test', errorHandler);
      emitter.on('test', normalHandler);
      emitter.on('error', errorListener);

      // This should not crash the emitter
      emitter.emit('test');
      
      // The second handler should still be called
      expect(normalHandler).toHaveBeenCalledTimes(1);
      expect(errorListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle very long event names', () => {
      const longEventName = 'a'.repeat(10000);
      const handler = jest.fn();
      
      emitter.on(longEventName, handler);
      emitter.emit(longEventName);
      
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle special characters in event names', () => {
      const specialEventName = 'event-with-dashes_and.underscores/and/slashes';
      const handler = jest.fn();
      
      emitter.on(specialEventName, handler);
      emitter.emit(specialEventName);
      
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle unicode characters in event names', () => {
      const unicodeEventName = '事件_événement_事件';
      const handler = jest.fn();
      
      emitter.on(unicodeEventName, handler);
      emitter.emit(unicodeEventName);
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
