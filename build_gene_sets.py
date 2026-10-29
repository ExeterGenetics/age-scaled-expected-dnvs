"""Build the pre-defined gene sets the app can subset to, keyed to gene_rates.tsv symbols.

Every source gene is resolved to an HGNC ID (directly, via Entrez or Ensembl ID, or
by symbol) and then to the symbol used in gene_rates.tsv, so renamed genes still match.

  ddg2p_mono      G2P DD panel, allelic requirement monoallelic_autosomal, confidence
                  definitive / strong / moderate (limited, disputed, refuted dropped)
  panelapp_green  Genomics England PanelApp, green (confidence 3) genes on any panel
  omim_morbid     OMIM phenotype-gene links from NCBI mim2gene_medgen, source GeneMap,
                  with no qualifier (drops question, susceptibility, nondisease, ...).
                  A stand-in for morbidmap.txt, which needs an OMIM licence key.
  loeuf_lt_0.6    gnomAD v4.1 constraint, canonical MANE Select transcript, LOEUF < 0.6

Also writes an alias map (previous / alias HGNC symbols -> gene_rates symbol) used to
resolve custom gene lists in the app.

Usage:  python build_gene_sets.py gene_rates.tsv ~/dnms/G2P/G2P_DD_2026-10-02.csv gene_sets
Expects gene_sets/raw/ to hold hgnc_complete_set.txt, mim2gene_medgen and
gnomad.v4.1.constraint_metrics.tsv; fetches PanelApp into raw/ if not cached.
Writes: gene_sets/gene_sets.json
"""
import csv
import datetime
import json
import os
import re
import subprocess
import sys

PANELAPP_URL = ("https://panelapp.genomicsengland.co.uk/api/v1/genes/"
                "?confidence_level=3&entity_type=gene&page=1")
DDG2P_CONFIDENCE = {"definitive", "strong", "moderate"}
LOEUF_CUT = 0.6

csv.field_size_limit(sys.maxsize)


def read_tsv(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


class Hgnc:
    def __init__(self, path):
        self.symbol, self.by_symbol, self.by_entrez, self.by_ensg = {}, {}, {}, {}
        self.location, self.locus_group = {}, {}
        others = {}
        for r in read_tsv(path):
            h = r["hgnc_id"]
            self.symbol[h] = r["symbol"]
            self.location[h] = r["location"]
            self.locus_group[h] = r["locus_group"]
            self.by_symbol[r["symbol"].upper()] = h
            if r["entrez_id"]:
                self.by_entrez[r["entrez_id"]] = h
            if r["ensembl_gene_id"]:
                self.by_ensg[r["ensembl_gene_id"]] = h
            for s in (r["prev_symbol"] + "|" + r["alias_symbol"]).split("|"):
                if s:
                    others.setdefault(s.strip('"').upper(), set()).add(h)
        # previous / alias symbols only where unambiguous and not someone's current symbol
        self.by_other = {s: next(iter(hs)) for s, hs in others.items()
                         if len(hs) == 1 and s not in self.by_symbol}

    def why_missing(self, h):
        """Reason a gene has no rates: off the autosomes, not protein-coding, or neither."""
        if h is None:
            return "unknown_symbol"
        if not re.match(r"^\d", self.location.get(h, "")):
            return "not_autosomal"
        if self.locus_group.get(h) != "protein-coding gene":
            return "not_protein_coding"
        return "no_rates"

    def resolve_symbol(self, s):
        s = s.strip().upper()
        return self.by_symbol.get(s) or self.by_other.get(s)


def fetch_panelapp(cache):
    if os.path.exists(cache):
        return json.load(open(cache))
    rows, url = [], PANELAPP_URL
    while url:
        # curl rather than urllib: python.org builds ship without a CA bundle
        page = json.loads(subprocess.run(
            ["curl", "-sSf", "--retry", "5", "--max-time", "60", url],
            check=True, capture_output=True).stdout)
        for g in page["results"]:
            rows.append({"hgnc_id": g["gene_data"].get("hgnc_id"), "symbol": g["entity_name"],
                         "panel": g["panel"]["name"], "panel_version": g["panel"]["version"]})
        url = page["next"]
        print("  panelapp: %d / %d" % (len(rows), page["count"]), end="\r", flush=True)
    print()
    json.dump(rows, open(cache, "w"))
    return rows


def main(rates_path, ddg2p_path, out_dir):
    raw = os.path.join(out_dir, "raw")
    hgnc = Hgnc(os.path.join(raw, "hgnc_complete_set.txt"))

    rates_genes = [r["gene"] for r in read_tsv(rates_path)]
    rates_set = set(rates_genes)
    hgnc_to_rates = {}
    for g in rates_genes:
        h = hgnc.resolve_symbol(g)
        if h:
            hgnc_to_rates.setdefault(h, g)
    print("gene_rates genes: %d, resolved to HGNC: %d" % (len(rates_genes), len(hgnc_to_rates)))

    def to_rates(hgnc_ids, symbols):
        """Map source genes to gene_rates symbols; returns (genes, n_source, unmatched by reason)."""
        found, unmatched = set(), {}
        for h, s in zip(hgnc_ids, symbols):
            h = h or (hgnc.resolve_symbol(s) if s else None)
            g = hgnc_to_rates.get(h) if h else None
            if g is None and s in rates_set:
                g = s
            if g:
                found.add(g)
            else:
                unmatched.setdefault(hgnc.why_missing(h), set()).add(hgnc.symbol.get(h) or s or h)
        return sorted(found), len(hgnc_ids), {k: sorted(v) for k, v in sorted(unmatched.items())}

    def unique(pairs):
        seen = {}
        for h, s in pairs:
            seen.setdefault(h or s, (h, s))
        return [p[0] for p in seen.values()], [p[1] for p in seen.values()]

    today = datetime.date.today().isoformat()
    sets = []

    def add(set_id, label, description, source, hgnc_ids, symbols):
        genes, n, unmatched = to_rates(hgnc_ids, symbols)
        sets.append({"id": set_id, "label": label, "description": description, "source": source,
                     "n_source": n, "n_in_rates": len(genes), "unmatched": unmatched, "genes": genes})
        print("%-15s source %5d  in gene_rates %5d  unmatched %s" % (
            set_id, n, len(genes), {k: len(v) for k, v in unmatched.items()}))

    # DDG2P monoallelic
    with open(ddg2p_path, newline="") as fh:
        rows = [r for r in csv.DictReader(fh)
                if r["allelic requirement"] == "monoallelic_autosomal"
                and r["confidence"] in DDG2P_CONFIDENCE]
    ids, syms = unique(("HGNC:" + r["hgnc id"] if r["hgnc id"] else None, r["gene symbol"]) for r in rows)
    add("ddg2p_mono", "DDG2P monoallelic",
        "G2P DD panel, monoallelic_autosomal, confidence definitive/strong/moderate",
        os.path.basename(ddg2p_path), ids, syms)

    # PanelApp green, any panel
    pa = fetch_panelapp(os.path.join(raw, "panelapp_green_genes.json"))
    ids, syms = unique((r["hgnc_id"], r["symbol"]) for r in pa)
    add("panelapp_green", "PanelApp green (any panel)",
        "Genomics England PanelApp, green genes on any of %d panels" % len({r["panel"] for r in pa}),
        "PanelApp API, retrieved %s" % today, ids, syms)

    # OMIM morbid via NCBI mim2gene_medgen
    with open(os.path.join(raw, "mim2gene_medgen"), newline="") as fh:
        rows = [r for r in csv.DictReader(fh, delimiter="\t")
                if r["type"] == "phenotype" and r["GeneID"] != "-"
                and "GeneMap" in r["Source"] and r["Comment"] == "-"]
    ids, syms = unique((hgnc.by_entrez.get(r["GeneID"]), "Entrez:" + r["GeneID"]) for r in rows)
    add("omim_morbid", "OMIM morbid",
        "Genes with a confirmed OMIM phenotype (NCBI mim2gene_medgen, GeneMap, no question/"
        "susceptibility/nondisease qualifier)",
        "NCBI mim2gene_medgen, retrieved %s" % today, ids, syms)

    # gnomAD v4.1 LOEUF
    pairs = []
    for r in read_tsv(os.path.join(raw, "gnomad.v4.1.constraint_metrics.tsv")):
        # each MANE gene has an Ensembl and a RefSeq row; keep the Ensembl one
        if (r["transcript"].startswith("ENST") and r["canonical"] == "true"
                and r["mane_select"] == "true" and r["lof.oe_ci.upper"] not in ("", "NA")):
            if float(r["lof.oe_ci.upper"]) < LOEUF_CUT:
                pairs.append((hgnc.by_ensg.get(r["gene_id"]), r["gene"]))
    ids, syms = unique(pairs)
    add("loeuf_lt_0.6", "High constraint (LOEUF < 0.6)",
        "gnomAD v4.1, canonical MANE Select transcript, LOEUF < 0.6",
        "gnomad.v4.1.constraint_metrics.tsv", ids, syms)

    aliases = {}
    for s, h in hgnc.by_other.items():
        g = hgnc_to_rates.get(h)
        if g and s not in rates_set:
            aliases[s] = g
    for g in rates_genes:  # current HGNC symbol when gene_rates carries an older one
        h = hgnc.resolve_symbol(g)
        if h and hgnc.symbol[h].upper() != g.upper():
            aliases.setdefault(hgnc.symbol[h].upper(), g)

    out = os.path.join(out_dir, "gene_sets.json")
    json.dump({"built": today, "sets": sets, "aliases": aliases}, open(out, "w"), separators=(",", ":"))
    print("aliases: %d\nwrote %s" % (len(aliases), out))


if __name__ == "__main__":
    main(*sys.argv[1:4])
