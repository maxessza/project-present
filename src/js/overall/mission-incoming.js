(() => {
  'use strict';
  const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  window.createMissionIncoming = onChange => {
    let generation = 0;
    let sequence = 0;
    let receiptSequence = 0;
    let dropNext = false;
    const channels = new Set();
    const inbox = [];
    const posted = [];
    const received = [];
    const dropped = [];
    const applied = [];
    const changed = () => { if (typeof onChange === 'function') onChange(snapshot()); };
    const retire = channel => {
      if (!channel) return;
      channel.port1.close();
      channel.port2.close();
      channels.delete(channel);
    };
    const validIdentity = envelope => envelope && typeof envelope === 'object' &&
      Number.isInteger(envelope.generation) && envelope.generation === generation &&
      typeof envelope.messageId === 'string' &&
      posted.some(item => item.messageId === envelope.messageId && item.kind === envelope.kind && item.routeId === envelope.routeId);

    function post(kind, fields) {
      const messageId = `station-g${generation}-m${++sequence}`;
      const senderEnvelope = freeze(clone({version: 1, generation, messageId, kind, ...fields}));
      posted.push(freeze(clone(senderEnvelope)));
      const channel = new MessageChannel();
      channels.add(channel);
      channel.port1.onmessage = event => {
        if (senderEnvelope.generation !== generation || !validIdentity(event.data)) {
          retire(channel);
          return;
        }
        const recipientEnvelope = freeze(clone(event.data));
        if (dropNext) {
          dropNext = false;
          dropped.push(freeze({messageId, generation, kind, reason: 'teaching drop before inbox'}));
          retire(channel);
          changed();
          return;
        }
        const receipt = freeze({receiptId: `boat-r${++receiptSequence}`, generation, messageId, kind, envelope: recipientEnvelope});
        received.push(receipt);
        inbox.push(receipt);
        retire(channel);
        changed();
      };
      channel.port1.start();
      channel.port2.postMessage(senderEnvelope);
      changed();
      return senderEnvelope;
    }
    function sendRoute(points, options = {}) {
      const routeId = options.routeId || `station-route-g${generation}`;
      const clonedPoints = Array.isArray(points) ? clone(points) : points;
      const count = Object.hasOwn(options, 'count') ? options.count : Array.isArray(clonedPoints) ? clonedPoints.length : null;
      const packetIndex = Object.hasOwn(options, 'packetIndex') ? options.packetIndex : 0;
      return post('route-upload', {routeId, packetIndex, count, points: clonedPoints});
    }
    function sendStart(routeId = `station-route-g${generation}`) {
      return post('start', {routeId, sealExistingBatch: true});
    }
    function sendCommand(command, values = {}) {
      return post('command', {command, manualSpeed: values.manualSpeed || 0, manualSteer: values.manualSteer || 0});
    }
    function takeNext() { return inbox.shift() || null; }
    function markApplied(receipt, result) {
      if (!receipt || receipt.generation !== generation || applied.some(item => item.receiptId === receipt.receiptId)) return false;
      applied.push(freeze({receiptId: receipt.receiptId, generation, kind: receipt.kind, messageId: receipt.messageId, result: clone(result)}));
      changed();
      return true;
    }
    function snapshot() { return clone({generation, sequence, posted, received, dropped, applied, inbox, inboxCount: inbox.length, activeChannels: channels.size}); }
    function reset() {
      generation += 1;
      channels.forEach(retire);
      channels.clear();
      sequence = 0;
      receiptSequence = 0;
      inbox.length = 0;
      posted.length = 0;
      received.length = 0;
      dropped.length = 0;
      applied.length = 0;
      dropNext = false;
      changed();
      return generation;
    }
    function close() { reset(); }
    function configure(options = {}) { if (Object.hasOwn(options, 'dropNext')) dropNext = !!options.dropNext; changed(); }
    return Object.freeze({sendRoute, sendStart, sendCommand, takeNext, markApplied, snapshot, reset, close, configure});
  };
})();
