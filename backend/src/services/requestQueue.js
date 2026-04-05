/**
 * In-memory promise queue with bounded concurrency.
 *
 * In OCI (or any cloud), each container instance can own its queue.
 * For horizontal scale, replace this with Redis/SQS-backed queue.
 */
class RequestQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.active = 0;
    this.pending = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.pending.push({ task, resolve, reject });
      this._dequeue();
    });
  }

  _dequeue() {
    if (this.active >= this.concurrency) return;
    const next = this.pending.shift();
    if (!next) return;

    this.active += 1;
    Promise.resolve()
      .then(next.task)
      .then(next.resolve)
      .catch(next.reject)
      .finally(() => {
        this.active -= 1;
        this._dequeue();
      });
  }
}

module.exports = { RequestQueue };
