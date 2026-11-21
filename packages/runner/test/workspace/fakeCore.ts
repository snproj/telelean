/**
 * A small stand-in for the core functions a ModelWorkspace calls (ModelWorkspaceOptions.core), so the workspace's
 * own logic (scan, refresh, sidecars, undo, history, graph.json) is tested in isolation from the real core.
 * It understands just enough of the markup (`id`, `type`, `natural_name` lines of `@@ telelean v1` blocks).
 */
import {
  ActionError,
  appendToLayout,
  createUserNode,
  emptyLayout,
  inboxPath,
  isSubjectName,
  libraryRootFile,
  moveInLayout,
  NODE_TYPES,
  orderByLayout,
  parseNodeType,
  slugId,
  subjectOfPath,
  subjectScaffold,
  withoutIds,
  type BoardAction,
  type EditPlan,
  type GraphJson,
  type GraphJsonOptions,
  type MarkupBlock,
  type ModelNode,
  type ParsedFile,
  type PlanContext,
  type ProjectInput,
  type ProjectModel,
  type SubjectGraphOptions,
  type TlGraph,
  type TlNode,
} from '@telelean/core';

import type { WorkspaceCore } from '../../src/workspace/types.js';

const BLOCK = /\/-\n@@ telelean v1\n([\s\S]*?)-\//g;

export function fakeParseLeanFile(path: string, text: string): ParsedFile {
  const blocks: MarkupBlock[] = [];
  for (const match of text.matchAll(BLOCK)) {
    const body = match[1] ?? '';
    const field = (key: string): string | undefined => new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(body)?.[1]?.trim();
    const naturalName = field('natural_name') ?? '';
    const start = match.index ?? 0;
    blocks.push({
      id: field('id') ?? slugId(naturalName, () => false),
      idWritten: field('id') !== undefined,
      version: 1,
      // Spec v4: AXIOM or PROPOSITION, the old kinds read as aliases (as the real parser does).
      fields: { type: parseNodeType(field('type') ?? 'AXIOM')?.type ?? 'AXIOM', naturalName },
      extensions: {},
      span: { start, end: start + match[0].length },
      binding: { mode: 'none' },
    } as unknown as MarkupBlock);
  }
  const imports = [...text.matchAll(/^import (\S+)$/gm)].map((m) => m[1] ?? '');
  return { path, text, eol: '\n', blocks, decls: [], imports, diagnostics: [] };
}

export function fakeBuildProjectModel(input: ProjectInput): ProjectModel {
  const library = input.library;
  const subjects = new Map<string, { files: string[]; nodeCount: number }>();
  const nodes = new Map<string, ModelNode>();
  for (const file of input.files) {
    const subject = subjectOfPath(file.path, library);
    const inSubject =
      subject !== undefined &&
      isSubjectName(subject) &&
      (file.path === `${library}/${subject}.lean` || (file.path.startsWith(`${library}/${subject}/`) && file.path.endsWith('.lean')));
    const entry = inSubject ? (subjects.get(subject) ?? { files: [], nodeCount: 0 }) : undefined;
    if (entry && subject !== undefined) {
      entry.files.push(file.path);
      subjects.set(subject, entry);
    }
    for (const block of file.blocks) {
      if (nodes.has(block.id)) continue;
      const node = createUserNode({
        id: block.id,
        type: block.fields.type ?? 'AXIOM',
        naturalName: block.fields.naturalName ?? '',
        subject: inSubject && subject !== undefined ? subject : '',
      });
      nodes.set(block.id, { node, file: file.path, block });
      if (entry) entry.nodeCount++;
    }
  }
  const freshFiles = new Set(
    (input.facts?.modules ?? []).filter((m) => input.fileHashes[m.file] === m.sourceSha256).map((m) => m.file),
  );
  return {
    library,
    subjects: [...subjects.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, v]) => ({ name, nodeCount: v.nodeCount, files: [...v.files].sort() })),
    nodes,
    files: new Map(input.files.map((f) => [f.path, f])),
    ...(input.facts ? { facts: input.facts } : {}),
    freshFiles,
    vocabulary: [],
    diagnostics: [],
    declFacts: new Map(),
    ownerOfDecl: new Map(),
  };
}

function subjectNodes(model: ProjectModel, subject: string): TlNode[] {
  return [...model.nodes.values()].filter((n) => n.node.subject === subject).map((n) => n.node);
}

export function fakeSubjectGraph(model: ProjectModel, subject: string, options: SubjectGraphOptions): TlGraph {
  const list = subjectNodes(model, subject);
  const order = orderByLayout(list, options.layout);
  const byId = new Map(list.map((n) => [n.id, n]));
  const nodes = NODE_TYPES.flatMap((type) => order[type].map((id) => byId.get(id)).filter((n): n is TlNode => n !== undefined));
  return { version: options.version, subject, nodes, edges: [], vocabulary: [], diagnostics: [], semantic: options.semantic };
}

function nodeOf(model: ProjectModel, id: string): ModelNode {
  const found = model.nodes.get(id);
  if (!found) throw new ActionError('not-found', `There is no card "${id}" any more.`);
  return found;
}

function fileText(model: ProjectModel, path: string): string {
  const file = model.files.get(path);
  if (!file) throw new ActionError('not-found', `${path} is not a model file.`);
  return file.text;
}

export function fakePlanAction(model: ProjectModel, action: BoardAction, ctx: PlanContext): EditPlan {
  switch (action.kind) {
    case 'add-node': {
      const path = inboxPath(action.subject, model.library);
      const before = fileText(model, path);
      const id = slugId(action.naturalName, new Set(model.nodes.keys()));
      const block = `/-\n@@ telelean v1\nid: ${id}\ntype: ${action.type}\nnatural_name: ${action.naturalName}\nasserted: ${ctx.today}\n-/\n`;
      const end = before.lastIndexOf(`end ${action.subject}`);
      const after = end >= 0 ? `${before.slice(0, end)}${block}\n${before.slice(end)}` : `${before}\n${block}`;
      return {
        action: 'add-node',
        label: `Add ${action.type.toLowerCase()}: ${action.naturalName}`,
        subject: action.subject,
        nodes: [id],
        changes: [{ path, before, after }],
        layout: { subject: action.subject, layout: appendToLayout(ctx.layouts[action.subject] ?? emptyLayout(), id, action.type) },
        nodeId: id,
      };
    }
    case 'edit-node': {
      if (action.field !== 'naturalName' || action.value === null) throw new ActionError('invalid', 'the fake core edits sentences only');
      const found = nodeOf(model, action.id);
      const before = fileText(model, found.file);
      const old = `natural_name: ${found.node.naturalName}`;
      const at = before.indexOf(old, found.block.span.start);
      if (at < 0) throw new ActionError('unsafe', 'sentence line not found');
      const after = `${before.slice(0, at)}natural_name: ${action.value}${before.slice(at + old.length)}`;
      return { action: 'edit-node', label: `Edit sentence: ${action.value}`, subject: found.node.subject, nodes: [action.id], changes: [{ path: found.file, before, after }] };
    }
    case 'delete-node': {
      const found = nodeOf(model, action.id);
      const before = fileText(model, found.file);
      let end = found.block.span.end;
      if (before[end] === '\n') end++;
      const after = `${before.slice(0, found.block.span.start)}${before.slice(end)}`;
      const subject = found.node.subject;
      const lean = action.id.replaceAll('-', '_');
      return {
        action: 'delete-node',
        label: `Delete: ${found.node.naturalName}`,
        subject,
        nodes: [action.id],
        changes: [{ path: found.file, before, after }],
        layout: { subject, layout: withoutIds(ctx.layouts[subject] ?? emptyLayout(), [action.id]) },
        archive: action.keepLean
          ? []
          : [{ subject, nodeId: action.id, declName: `${subject}.${lean}.holds`, text: `theorem ${lean}.holds : ${lean} := by\n  trivial`, reason: 'deleted' }],
      };
    }
    case 'reorder': {
      const found = nodeOf(model, action.id);
      const subject = found.node.subject;
      const layout = ctx.layouts[subject] ?? emptyLayout();
      const moved = moveInLayout(layout, orderByLayout(subjectNodes(model, subject), layout), action.id, action.column, action.beforeId);
      return { action: 'reorder', label: `Move: ${found.node.naturalName}`, subject, nodes: [action.id], changes: [], layout: { subject, layout: moved }, layoutOnly: true };
    }
    case 'create-subject': {
      if (model.subjects.some((s) => s.name === action.name)) throw new ActionError('invalid', `There is already a subject "${action.name}".`);
      const rootFile = libraryRootFile(model.library);
      const rootText = model.files.get(rootFile)?.text ?? null;
      const importLine = `import ${model.library}.${action.name}\n`;
      return {
        action: 'create-subject',
        label: `New subject: ${action.name}`,
        subject: action.name,
        nodes: [],
        changes: [
          ...subjectScaffold(action.name, model.library).map((f) => ({ path: f.path, before: null, after: f.text })),
          { path: rootFile, before: rootText, after: rootText === null ? importLine : `${rootText}${importLine}` },
        ],
        layout: { subject: action.name, layout: emptyLayout() },
      };
    }
    case 'change-kind':
      throw new ActionError('needs-confirmation', 'Make Axiom: 2 declarations apply this .holds to arguments.', ['cynder-not-good', 'Spyro.helper_lemma']);
    case 'set-premises':
      throw new ActionError('not-yet', 'Proving from no premises is available from M2.');
    case 'move-cards': {
      // Spec v4 slice 1b: layout only, like reorder.
      const ids = Object.keys(action.positions);
      const found = nodeOf(model, ids[0] ?? '');
      const subject = found.node.subject;
      const layout = ctx.layouts[subject] ?? emptyLayout();
      return {
        action: 'move-cards',
        label: ids.length === 1 ? `Move: ${found.node.naturalName}` : `Move: ${ids.length} cards`,
        subject,
        nodes: ids,
        changes: [],
        layout: { subject, layout: { ...layout, positions: { ...(layout.positions ?? {}), ...action.positions } } },
        layoutOnly: true,
      };
    }
    case 'add-arrows':
    case 'remove-arrows':
    case 'set-from-nothing':
    case 'claim-pending':
      throw new ActionError('not-yet', `the fake core does not plan ${action.kind}`);
  }
}

export function fakeToGraphJson(model: ProjectModel, options: GraphJsonOptions): GraphJson {
  return {
    format: 'telelean-graph',
    format_version: '1.0',
    generator: { name: 'telelean', version: options.generatorVersion },
    position_encoding: 'utf-16',
    line_base: 0,
    generated_at: options.generatedAt,
    semantic: {
      available: model.facts !== undefined,
      stale: false,
      toolchain: model.facts?.toolchain ?? null,
      checked_at: model.facts?.finishedAt ?? null,
      status: model.facts?.status ?? 'unavailable',
    },
    subjects: model.subjects.map((s) => ({ name: s.name, files: [...s.files], node_count: s.nodeCount })),
    nodes: [],
    vocabulary: [],
    edges: [],
    attempts: [],
    diagnostics: [],
    files: Object.entries(options.fileHashes).map(([path, sha256]) => ({ path, sha256, node_count: 0 })),
  };
}

export const fakeCore: WorkspaceCore = {
  parseLeanFile: fakeParseLeanFile,
  buildProjectModel: fakeBuildProjectModel,
  subjectGraph: fakeSubjectGraph,
  planAction: fakePlanAction,
  toGraphJson: fakeToGraphJson,
};
