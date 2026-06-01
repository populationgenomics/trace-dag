import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { TraceDag } from './TraceDag.js';
import type { TraceDagInput } from './types.js';

afterEach(cleanup);

function node(
  id: string,
  inputs: string[] = [],
  extra: Partial<TraceDagInput> = {},
): TraceDagInput {
  return { id, inputs, label: id, color: '#1f77b4', ...extra };
}

const SAMPLE = [node('a'), node('b', ['a']), node('c', ['a'])];

describe('TraceDag', () => {
  it('renders the empty message when there are no nodes', () => {
    render(<TraceDag nodes={[]} />);
    expect(screen.getByText('No nodes to render.')).toBeTruthy();
  });

  it('renders a custom empty message', () => {
    render(<TraceDag nodes={[]} emptyMessage={<span>nothing here</span>} />);
    expect(screen.getByText('nothing here')).toBeTruthy();
  });

  it('renders an svg with the supplied aria-label', () => {
    render(<TraceDag nodes={SAMPLE} ariaLabel="lineage graph" />);
    expect(screen.getByRole('img', { name: 'lineage graph' })).toBeTruthy();
  });

  it('renders a label per box node', () => {
    render(<TraceDag nodes={SAMPLE} />);
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('shows the copy-DOT button by default and hides it when disabled', () => {
    const { rerender } = render(<TraceDag nodes={SAMPLE} />);
    expect(screen.getByRole('button', { name: /copy DOT/i })).toBeTruthy();
    rerender(<TraceDag nodes={SAMPLE} showCopyDot={false} />);
    expect(screen.queryByRole('button', { name: /copy DOT/i })).toBeNull();
  });

  it('copies DOT to the clipboard when the button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<TraceDag nodes={SAMPLE} />);
    fireEvent.click(screen.getByRole('button', { name: /copy DOT/i }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('digraph lineage');
    vi.unstubAllGlobals();
  });

  it('fires onNodeClick with the laid-out node', () => {
    const onNodeClick = vi.fn();
    render(<TraceDag nodes={SAMPLE} onNodeClick={onNodeClick} />);
    fireEvent.click(screen.getByText('b'));
    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].id).toBe('b');
    expect(onNodeClick.mock.calls[0][0]).toHaveProperty('cx');
    expect(onNodeClick.mock.calls[0][0]).toHaveProperty('layer');
  });

  // a -> b, a -> c ; d is unrelated.
  const GRAPH = [
    node('a'), node('b', ['a']), node('c', ['a']), node('d'),
  ];
  const boxGroup = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll('text')]
      .find((el) => el.textContent === label)?.closest('g') ?? null;
  const visibleEdges = (container: HTMLElement) =>
    [...container.querySelectorAll('path')]
      .filter((p) => p.getAttribute('stroke') !== 'transparent');

  describe('selection', () => {
    it('draws everything at normal emphasis with no selection', () => {
      const { container } = render(<TraceDag nodes={GRAPH} />);
      expect(boxGroup(container, 'a')!.getAttribute('opacity')).toBe('1');
      for (const e of visibleEdges(container)) {
        expect(e.getAttribute('opacity')).toBe('0.85');
      }
    });

    it('selecting a node highlights it, dims unrelated, semi-dims neighbours', () => {
      const { container } = render(<TraceDag nodes={GRAPH} />);
      fireEvent.click(screen.getByText('a'));
      expect(boxGroup(container, 'a')!.getAttribute('opacity')).toBe('1');   // primary
      expect(boxGroup(container, 'b')!.getAttribute('opacity')).toBe('0.6'); // neighbour
      expect(boxGroup(container, 'c')!.getAttribute('opacity')).toBe('0.6'); // neighbour
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('0.15'); // dim
    });

    it('emphasises a selected node incident edges and dims the rest', () => {
      // Add an unrelated edge d->e so there is an edge to dim.
      const g = [...GRAPH, node('e', ['d'])];
      const { container } = render(<TraceDag nodes={g} />);
      fireEvent.click(screen.getByText('a'));
      const ops = visibleEdges(container).map((p) => p.getAttribute('opacity'));
      expect(ops.filter((o) => o === '1')).toHaveLength(2);    // a->b, a->c
      expect(ops.filter((o) => o === '0.12')).toHaveLength(1); // d->e
    });

    it('selecting an edge highlights both endpoint nodes', () => {
      const { container } = render(<TraceDag nodes={GRAPH} />);
      // The first visible edge is a->b; click its transparent hit path.
      const hit = [...container.querySelectorAll('path')]
        .find((p) => p.getAttribute('stroke') === 'transparent')!;
      fireEvent.click(hit);
      expect(boxGroup(container, 'a')!.getAttribute('opacity')).toBe('1');
      expect(boxGroup(container, 'b')!.getAttribute('opacity')).toBe('1');
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('0.15');
    });

    it('re-clicking the selection clears it', () => {
      const { container } = render(<TraceDag nodes={GRAPH} />);
      fireEvent.click(screen.getByText('a'));
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('0.15');
      fireEvent.click(screen.getByText('a'));
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('1');
    });

    it('clicking the background clears the selection', () => {
      const { container } = render(<TraceDag nodes={GRAPH} />);
      fireEvent.click(screen.getByText('a'));
      fireEvent.click(container.querySelector('svg')!);
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('1');
    });

    it('notifies onSelectionChange and onEdgeClick', () => {
      const onSelectionChange = vi.fn();
      const onEdgeClick = vi.fn();
      const { container } = render(
        <TraceDag nodes={GRAPH}
          onSelectionChange={onSelectionChange} onEdgeClick={onEdgeClick} />,
      );
      fireEvent.click(screen.getByText('a'));
      expect(onSelectionChange).toHaveBeenLastCalledWith({ kind: 'node', id: 'a' });
      const hit = [...container.querySelectorAll('path')]
        .find((p) => p.getAttribute('stroke') === 'transparent')!;
      fireEvent.click(hit);
      expect(onEdgeClick).toHaveBeenCalledOnce();
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        { kind: 'edge', from: 'a', to: 'b' },
      );
    });

    it('does not highlight or expose hit paths when selectable=false', () => {
      const { container } = render(<TraceDag nodes={GRAPH} selectable={false} />);
      fireEvent.click(screen.getByText('a'));
      expect(boxGroup(container, 'd')!.getAttribute('opacity')).toBe('1');
      const hit = [...container.querySelectorAll('path')]
        .find((p) => p.getAttribute('stroke') === 'transparent');
      expect(hit).toBeUndefined();
    });
  });

  it('renders tooltips as svg <title> elements', () => {
    const { container } = render(
      <TraceDag nodes={[node('a', [], { tooltip: 'hover me' })]} />,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe('hover me');
  });
});
