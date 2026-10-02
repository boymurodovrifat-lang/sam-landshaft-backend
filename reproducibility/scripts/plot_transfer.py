"""Produce a scientific plot of whole-layer tile payload by overview spacing."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('reports', nargs='+')
    p.add_argument('--output', required=True)
    p.add_argument('--viewport-spacing-m', type=float, default=134)
    a = p.parse_args()
    fig, ax = plt.subplots(figsize=(7, 4.4), layout='constrained')
    for filename in a.reports:
        r = json.loads(Path(filename).read_text())
        name = Path(filename).name.split('-')[0].upper()
        x = [v['approx_resolution_m'] for v in r['levels']]
        if any(v is None for v in x):
            raise ValueError('Reports must include native-resolution-m')
        y = [v['whole_level_payload_bytes'] / 2**20 for v in r['levels']]
        line, = ax.plot(x, y, 'o-', label=name)
        ax.axhline(r['file_MiB'], color=line.get_color(), linestyle='--', alpha=.65)
    ax.axvline(a.viewport_spacing_m, color='#666666', linestyle=':', label='Viewport: 134 m/pixel')
    ax.set_xscale('log', base=2)
    ax.set_yscale('log')
    ax.set_xlabel('Approximate ground spacing of overview (m/pixel)')
    ax.set_ylabel('Compressed imagery tile payload (MiB)')
    ax.grid(alpha=.2, which='both')
    ax.legend(frameon=False)
    fig.suptitle('COG transfer cost for a whole-region view')
    dest = Path(a.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(dest, dpi=300)
    plt.close(fig)
