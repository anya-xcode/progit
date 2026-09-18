// Limits how many sandbox runs happen at once so a burst of Run clicks
// cannot overload the machine.
export function createQueue(concurrency) {
  let active = 0;
  const waiting = [];

  const startNext = () => {
    if (active >= concurrency || waiting.length === 0) return;
    const { task, resolve, reject } = waiting.shift();
    active++;
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        startNext();
      });
  };

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        startNext();
      });
    },
  };
}
