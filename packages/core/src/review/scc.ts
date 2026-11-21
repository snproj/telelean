/**
 * Slice 2a2 (docs/slice2-plan.md section 4.5, D2-26): Tarjan's strongly connected components, written iteratively so a
 * long chain cannot overflow the stack. RV-5's cycles of items, and the walk over declarations no item owns, use it.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */

/**
 * The strongly connected components of the graph reachable from `roots`, sinks first (every component comes after
 * each component it reaches): a component's successors are always complete when it is emitted. `successors` may
 * name nodes outside `roots`; they are visited too.
 */
export function stronglyConnected(roots: Iterable<string>, successors: (node: string) => Iterable<string>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let next = 0;
  const lowOf = (node: string) => low.get(node) ?? 0;
  for (const root of roots) {
    if (index.has(root)) continue;
    const frames: Array<{ node: string; rest: Iterator<string> }> = [];
    const visit = (node: string) => {
      index.set(node, next);
      low.set(node, next);
      next++;
      stack.push(node);
      onStack.add(node);
      frames.push({ node, rest: successors(node)[Symbol.iterator]() });
    };
    visit(root);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as { node: string; rest: Iterator<string> };
      const step = frame.rest.next();
      if (step.done !== true) {
        const w = step.value;
        if (!index.has(w)) visit(w);
        else if (onStack.has(w)) low.set(frame.node, Math.min(lowOf(frame.node), index.get(w) ?? 0));
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent !== undefined) low.set(parent.node, Math.min(lowOf(parent.node), lowOf(frame.node)));
      if (lowOf(frame.node) !== index.get(frame.node)) continue;
      const component: string[] = [];
      for (;;) {
        const w = stack.pop() as string;
        onStack.delete(w);
        component.push(w);
        if (w === frame.node) break;
      }
      out.push(component.sort());
    }
  }
  return out;
}

/** Each node's component number (`stronglyConnected` over every node, restricted to the given nodes). */
export function componentOf(nodes: readonly string[], successors: (node: string) => Iterable<string>): Map<string, number> {
  const known = new Set(nodes);
  const components = stronglyConnected(nodes, (node) => [...successors(node)].filter((w) => known.has(w)));
  const out = new Map<string, number>();
  components.forEach((component, k) => {
    for (const node of component) out.set(node, k);
  });
  return out;
}
