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

  it('renders tooltips as svg <title> elements', () => {
    const { container } = render(
      <TraceDag nodes={[node('a', [], { tooltip: 'hover me' })]} />,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe('hover me');
  });
});
