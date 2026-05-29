import { CommandQueue, GameCommand } from '../core/GameCommand';

// ============================================================================
// TESTS - CommandQueue
// ============================================================================

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  test('should enqueue commands', () => {
    const cmd = queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    expect(queue.size()).toBe(1);
    expect(cmd.type).toBe('move');
    expect(cmd.playerId).toBe('player_main');
    expect(cmd.sequence).toBe(1);
  });

  test('should dequeue commands in order', () => {
    queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    queue.enqueue('attack', 'player_main', { targetId: 'mob_1' });

    const first = queue.dequeue();
    const second = queue.dequeue();

    expect(first?.type).toBe('move');
    expect(second?.type).toBe('attack');
  });

  test('should track sequence numbers', () => {
    const cmd1 = queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    const cmd2 = queue.enqueue('move', 'player_main', { x: 20, z: 30 });
    const cmd3 = queue.enqueue('move', 'player_main', { x: 30, z: 40 });

    expect(cmd1.sequence).toBe(1);
    expect(cmd2.sequence).toBe(2);
    expect(cmd3.sequence).toBe(3);
    expect(queue.getSequence()).toBe(3);
  });

  test('should limit buffer size', () => {
    const maxBuffer = 30;
    for (let i = 0; i < maxBuffer + 10; i++) {
      queue.enqueue('move', 'player_main', { x: i, z: i });
    }

    expect(queue.size()).toBe(maxBuffer);
  });

  test('should peek without removing', () => {
    queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    queue.enqueue('attack', 'player_main', { targetId: 'mob_1' });

    const peeked = queue.peek();
    expect(queue.size()).toBe(2);
    expect(peeked?.type).toBe('move');
  });

  test('should clear queue', () => {
    queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    queue.enqueue('attack', 'player_main', { targetId: 'mob_1' });

    queue.clear();
    expect(queue.size()).toBe(0);
  });

  test('should return pending commands', () => {
    queue.enqueue('move', 'player_main', { x: 10, z: 20 });
    queue.enqueue('attack', 'player_main', { targetId: 'mob_1' });

    const pending = queue.getPending();
    expect(pending.length).toBe(2);
    expect(pending[0].type).toBe('move');
    expect(pending[1].type).toBe('attack');
  });
});
