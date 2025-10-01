import readStream from '../../../src/lib/streams/readStream';
import writeStream from '../../../src/lib/streams/writeStream';
import type { ReadStream, WriteStream as WriteStreamType } from '../../../src/lib/streams/types';

describe('readStream', () => {
  let rs: ReadStream;
  let ws: WriteStreamType;

  beforeEach(() => {
    rs = readStream();
    ws = writeStream();
  });

  describe('initialization', () => {
    it('should create a readStream with correct initial state', () => {
      expect(rs.status).toBe('paused');
      expect(typeof rs.on).toBe('function');
      expect(typeof rs.emit).toBe('function');
      expect(typeof rs.pipe).toBe('function');
      expect(typeof rs.resume).toBe('function');
      expect(typeof rs.pause).toBe('function');
    });

    it('should be an EventEmitter', () => {
      const dataHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();

      rs.on('data', dataHandler);
      rs.on('error', errorHandler);
      rs.on('close', closeHandler);

      rs.emit('data', 'test data');
      rs.emit('error', new Error('test error'));
      rs.emit('close');

      expect(dataHandler).toHaveBeenCalledWith('test data');
      expect(errorHandler).toHaveBeenCalledWith(new Error('test error'));
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('status management', () => {
    it('should start with paused status', () => {
      expect(rs.status).toBe('paused');
    });

    it('should change status to open when resumed', () => {
      rs.resume();
      expect(rs.status).toBe('open');
    });

    it('should change status to paused when paused', () => {
      rs.resume(); // First resume to open
      rs.pause();
      expect(rs.status).toBe('paused');
    });

    it('should allow multiple resume calls', () => {
      rs.resume();
      expect(rs.status).toBe('open');
      
      rs.resume(); // Should remain open
      expect(rs.status).toBe('open');
    });

    it('should allow multiple pause calls', () => {
      rs.pause();
      expect(rs.status).toBe('paused');
      
      rs.pause(); // Should remain paused
      expect(rs.status).toBe('paused');
    });

    it('should toggle between paused and open states', () => {
      expect(rs.status).toBe('paused');
      
      rs.resume();
      expect(rs.status).toBe('open');
      
      rs.pause();
      expect(rs.status).toBe('paused');
      
      rs.resume();
      expect(rs.status).toBe('open');
    });
  });

  describe('pipe functionality', () => {
    it('should pipe to a writeStream and resume', () => {
      const resumeSpy = jest.spyOn(rs, 'resume');
      
      rs.pipe(ws);
      
      expect(resumeSpy).toHaveBeenCalledTimes(1);
      expect(rs.status).toBe('open');
    });

    it('should set up data forwarding when piped', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      
      // Emit data from readStream
      rs.emit('data', 'test data');
      
      expect(writeSpy).toHaveBeenCalledWith('test data');
    });

    it('should forward error events when piped', () => {
      const emitSpy = jest.spyOn(ws, 'emit');
      const testError = new Error('test error');
      
      rs.pipe(ws);
      
      // Emit error from readStream
      rs.emit('error', testError);
      
      expect(emitSpy).toHaveBeenCalledWith('error', testError);
    });

    it('should forward close events when piped', () => {
      const emitSpy = jest.spyOn(ws, 'emit');
      
      rs.pipe(ws);
      
      // Emit close from readStream
      rs.emit('close');
      
      expect(emitSpy).toHaveBeenCalledWith('close');
    });

    it('should handle multiple data events when piped', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      
      // Emit multiple data events
      rs.emit('data', 'data1');
      rs.emit('data', 'data2');
      rs.emit('data', 'data3');
      
      expect(writeSpy).toHaveBeenCalledTimes(3);
      expect(writeSpy).toHaveBeenNthCalledWith(1, 'data1');
      expect(writeSpy).toHaveBeenNthCalledWith(2, 'data2');
      expect(writeSpy).toHaveBeenNthCalledWith(3, 'data3');
    });

    it('should handle complex data types when piped', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      
      const testData = {
        message: 'hello',
        count: 42,
        nested: { value: true }
      };
      
      rs.emit('data', testData);
      
      expect(writeSpy).toHaveBeenCalledWith(testData);
    });
  });

  describe('event handling', () => {
    it('should emit and handle data events', () => {
      const dataHandler = jest.fn();
      rs.on('data', dataHandler);
      
      rs.emit('data', 'test data');
      
      expect(dataHandler).toHaveBeenCalledWith('test data');
    });

    it('should emit and handle error events', () => {
      const errorHandler = jest.fn();
      rs.on('error', errorHandler);
      
      const testError = new Error('stream error');
      rs.emit('error', testError);
      
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should emit and handle close events', () => {
      const closeHandler = jest.fn();
      rs.on('close', closeHandler);
      
      rs.emit('close');
      
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      rs.on('data', handler1);
      rs.on('data', handler2);
      
      rs.emit('data', 'test data');
      
      expect(handler1).toHaveBeenCalledWith('test data');
      expect(handler2).toHaveBeenCalledWith('test data');
    });
  });

  describe('integration with writeStream', () => {
    it('should work with a real writeStream instance', () => {
      const writeStreamDataHandler = jest.fn();
      const writeStreamErrorHandler = jest.fn();
      const writeStreamCloseHandler = jest.fn();
      
      ws.on('data', writeStreamDataHandler);
      ws.on('error', writeStreamErrorHandler);
      ws.on('close', writeStreamCloseHandler);
      
      rs.pipe(ws);
      
      // Test data forwarding
      rs.emit('data', 'forwarded data');
      expect(writeStreamDataHandler).toHaveBeenCalledWith('forwarded data');
      
      // Test error forwarding
      const testError = new Error('forwarded error');
      rs.emit('error', testError);
      expect(writeStreamErrorHandler).toHaveBeenCalledWith(testError);
      
      // Test close forwarding
      rs.emit('close');
      expect(writeStreamCloseHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle writeStream write method correctly', () => {
      const writeStreamDataHandler = jest.fn();
      ws.on('data', writeStreamDataHandler);
      
      rs.pipe(ws);
      
      // The pipe should set up the connection so that rs.emit('data') calls ws.write()
      rs.emit('data', 'test data');
      
      // This should trigger the writeStream's data event
      expect(writeStreamDataHandler).toHaveBeenCalledWith('test data');
    });

    it('should maintain independent state between readStream and writeStream', () => {
      const anotherWs = writeStream();
      
      rs.pipe(ws);
      rs.pipe(anotherWs);
      
      // Both writeStreams should receive the data
      const wsHandler = jest.fn();
      const anotherWsHandler = jest.fn();
      
      ws.on('data', wsHandler);
      anotherWs.on('data', anotherWsHandler);
      
      rs.emit('data', 'shared data');
      
      expect(wsHandler).toHaveBeenCalledWith('shared data');
      expect(anotherWsHandler).toHaveBeenCalledWith('shared data');
    });
  });

  describe('edge cases', () => {
    it('should handle empty data', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      rs.emit('data', '');
      
      expect(writeSpy).toHaveBeenCalledWith('');
    });

    it('should handle null data', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      rs.emit('data', null);
      
      expect(writeSpy).toHaveBeenCalledWith(null);
    });

    it('should handle undefined data', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      rs.emit('data', undefined);
      
      expect(writeSpy).toHaveBeenCalledWith(undefined);
    });

    it('should handle rapid successive events', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      
      // Emit many events rapidly
      for (let i = 0; i < 100; i++) {
        rs.emit('data', `data-${i}`);
      }
      
      expect(writeSpy).toHaveBeenCalledTimes(100);
      expect(writeSpy).toHaveBeenLastCalledWith('data-99');
    });

    it('should handle errors in event handlers gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();
      const errorListener = jest.fn();
      
      rs.on('data', errorHandler);
      rs.on('data', normalHandler);
      rs.on('error', errorListener);
      // This should not crash the stream
      rs.emit('data', 'test');
      
      expect(errorListener).toHaveBeenCalledTimes(1);
      // The second handler should still be called
      expect(normalHandler).toHaveBeenCalledWith('test');
    });

    it('should work correctly when piped multiple times to the same writeStream', () => {
      const writeSpy = jest.spyOn(ws, 'write');
      
      rs.pipe(ws);
      rs.pipe(ws); // Pipe again
      
      rs.emit('data', 'test data');
      
      // Should still work correctly (multiple listeners will be set up)
      expect(writeSpy).toHaveBeenCalledWith('test data');
    });
  });

  describe('status transitions', () => {
    it('should maintain status changes after pipe operations', () => {
      expect(rs.status).toBe('paused');
      
      rs.pipe(ws);
      expect(rs.status).toBe('open');
      
      rs.pause();
      expect(rs.status).toBe('paused');
      
      rs.resume();
      expect(rs.status).toBe('open');
    });

    it('should allow status changes before piping', () => {
      rs.resume();
      expect(rs.status).toBe('open');
      
      rs.pipe(ws);
      expect(rs.status).toBe('open');
    });

    it('should allow status changes after piping', () => {
      rs.pipe(ws);
      expect(rs.status).toBe('open');
      
      rs.pause();
      expect(rs.status).toBe('paused');
      
      rs.resume();
      expect(rs.status).toBe('open');
    });
  });
});
