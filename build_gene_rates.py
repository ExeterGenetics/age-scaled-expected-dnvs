"""Sum raw roulette MR per gene and consequence from the MANE-annotated coding VCFs.

Each site counts once per gene, under its most severe consequence for that gene
(BCSQ can list several comma-separated entries and &-joined combinations).
Sums are written for high-quality sites (FILTER high or TFBS, the same set the
k values were calibrated on) and for all sites.

Usage:  python build_gene_rates.py ../roulette_MANEannotated_coding_regions gene_rates.tsv
"""
import gzip
import os
import sys
from collections import defaultdict
from multiprocessing import Pool

# most severe first; the index is the severity rank
CLASSES = ["splice_acceptor", "splice_donor", "stop_gained", "start_lost",
           "stop_lost", "missense", "synonymous"]
RANK = {c: i for i, c in enumerate(CLASSES)}
HQ_FILTERS = {"high", "TFBS"}


def sum_chrom(path):
    # gene -> [hq sums per class..., all-site sums per class...]
    sums = defaultdict(lambda: [0.0] * (2 * len(CLASSES)))
    chrom_of = {}
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if line[0] == "#":
                continue
            f = line.rstrip("\n").split("\t")
            mr = bcsq = None
            for kv in f[7].split(";"):
                if kv.startswith("MR="):
                    mr = float(kv[3:])
                elif kv.startswith("BCSQ="):
                    bcsq = kv[5:]
            if mr is None or not bcsq:
                continue
            best = {}
            for entry in bcsq.split(","):
                parts = entry.split("|")
                if len(parts) < 2 or entry[0] == "@":
                    continue
                gene = parts[1]
                for csq in parts[0].lstrip("*").split("&"):
                    r = RANK.get(csq)
                    if r is not None and r < best.get(gene, 99):
                        best[gene] = r
            hq = f[6] in HQ_FILTERS
            for gene, r in best.items():
                row = sums[gene]
                row[len(CLASSES) + r] += mr
                if hq:
                    row[r] += mr
                chrom_of[gene] = f[0]
    return chrom_of, dict(sums)


def main(vcf_dir, out_path):
    paths = [os.path.join(vcf_dir, "%d_annot.vcf.gz" % c) for c in range(1, 23)]
    with Pool(min(8, os.cpu_count() or 1)) as pool:
        results = pool.map(sum_chrom, paths)
    header = ["gene", "chrom"] + ["hq_" + c for c in CLASSES] + ["all_" + c for c in CLASSES]
    n = 0
    with open(out_path, "w") as out:
        out.write("\t".join(header) + "\n")
        for chrom_of, sums in results:
            for gene in sorted(sums):
                out.write("\t".join([gene, chrom_of[gene]] +
                                    ["%.4f" % v for v in sums[gene]]) + "\n")
                n += 1
    print("wrote %d genes to %s" % (n, out_path))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
