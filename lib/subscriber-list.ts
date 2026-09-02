export function subscribeToList<T>(subscribers: Array<T | null>, value: T) {
  const index = subscribers.push(value) - 1;
  return () => {
    if (subscribers[index] === value) subscribers[index] = null;
  };
}
