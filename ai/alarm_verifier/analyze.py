"""Operational metrics + figures for the alarm verifier (reads results of train_eval.py).

Product question: the certified panel (modelled by a classic optical detector) rings.
Does the advisory AI (a) confirm real fires within 60 s of the panel alarm (25.858-inspired
target) and (b) flag nuisance alarms to support the operator's "levée de doute"?

Usage: python -m ai.alarm_verifier.analyze
"""
from __future__ import annotations

import json
import pickle

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from ai.common.data import ROOT

RES = ROOT / "ai" / "alarm_verifier" / "results"
FIG = ROOT / "docs" / "results"


def operational(eps: pd.DataFrame) -> dict:
    fire, nuis = eps[eps.label == "fire"], eps[eps.label == "nuisance"]
    tripped_nuis = nuis[nuis.optical_trip]
    delay = (fire.t_ai_fire_s - fire.t_optical_s)
    return {
        "panel_false_alarms": int(len(tripped_nuis)),
        "panel_false_alarms_flagged_nuisance_by_ai": int((~tripped_nuis.ai_fire).sum()),
        "panel_false_alarms_list": tripped_nuis.scenario.tolist(),
        "panel_false_alarms_ai_confused": tripped_nuis[tripped_nuis.ai_fire].scenario.tolist(),
        "fires_confirmed_by_ai": int(fire.ai_fire.sum()),
        "fires_total": int(len(fire)),
        "fires_ai_before_panel": int((delay < 0).sum()),
        "fires_ai_within_60s_of_panel": int((delay <= 60).sum()),
        "ai_minus_panel_delay_median_s": float(delay.median()),
        "ai_minus_panel_delay_max_s": float(delay.max()),
        "nuisances_never_ringing_panel_but_ai_fire": nuis[(~nuis.optical_trip) & nuis.ai_fire].scenario.tolist(),
    }


def main() -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    m = json.loads((RES / "metrics.json").read_text(encoding="utf-8"))
    v1 = json.loads((RES / "metrics_v1_single_channel.json").read_text(encoding="utf-8"))
    hall = pd.read_csv(RES / "episodes_hall_loeo.csv")
    en54 = pd.read_csv(RES / "episodes_en54_crosssite.csv")
    m["operational_hall"] = operational(hall)
    m["operational_en54"] = operational(en54)
    m["v1_vs_v2"] = {
        "v1_single_channel": {k: v1[k] for k in ["nuisance_rejection_rate_ai", "t_ai_fire_median_s"]}
        | {"background_ai_fire_events_per_100h": v1["background"]["ai_fire_events_per_100h"]},
        "v2_dual_channel": {k: m[k] for k in ["nuisance_rejection_rate_ai", "t_ai_fire_median_s"]}
        | {"background_ai_fire_events_per_100h": m["background"]["ai_fire_events_per_100h"]},
        "note": "v1 also counted verdicts latched before the run start (evaluation bug, fixed in v2).",
    }
    (RES / "metrics.json").write_text(json.dumps(m, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: m[k] for k in ["operational_hall", "operational_en54", "v1_vs_v2"]},
                     indent=2, default=str))

    # Figure 1: per-run outcome, AI vs classic optical detector
    fig, ax = plt.subplots(figsize=(11, 6))
    d = hall.sort_values(["label", "scenario", "episode"])
    y = np.arange(len(d))
    ax.barh(y - 0.2, d.optical_trip.astype(int), height=0.4, color="#999",
            label="Détecteur optique classique : alarme")
    ax.barh(y + 0.2, d.ai_fire.astype(int), height=0.4,
            color=np.where(d.label == "fire", "#2a9d3a", "#d62828"), label="IA : verdict FEU")
    ax.set_yticks(y, [f"{r.scenario_fr} #{r.episode.split('#')[1]} ({'feu' if r.label=='fire' else 'nuisance'})"
                      for r in d.itertuples()], fontsize=8)
    ax.set_xticks([0, 1], ["non", "oui"])
    ax.set_title("Hall industriel — validation « leave-one-episode-out » (essai jamais vu)")
    ax.legend(loc="lower right", fontsize=8)
    fig.tight_layout()
    fig.savefig(FIG / "verifier_runs.png", dpi=130)
    plt.close(fig)

    # Figure 2: timelines for one fire and one nuisance
    with open(RES / "timelines_hall_loeo.pkl", "rb") as fh:
        tls = pickle.load(fh)
    fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=False)
    for ax, ep, title in [(axes[0], "Wood#3", "Feu réel : bois #3"),
                          (axes[1], "Deodorant#2", "Nuisance : déodorant #2")]:
        tl = tls[ep]
        ax.plot(tl.t_rel_s / 60, tl.p, color="k", label="score IA (feu)")
        ax.plot(tl.t_rel_s / 60, tl.max_log_dPM / 10, color="#888", ls="--", label="particules (log, /10)")
        ax.plot(tl.t_rel_s / 60, np.clip(tl.max_dCO, 0, 5) / 5, color="#e76f51", ls=":", label="CO (/5 ppm)")
        ax.axhline(0.7, color="#d62828", lw=0.8)
        ax.axhline(0.3, color="#f4a261", lw=0.8)
        fire = tl[tl.verdict == "FIRE"]
        if len(fire):
            ax.axvline(fire.t_rel_s.iloc[0] / 60, color="#d62828", label="verdict FEU")
        ax.set_ylim(-0.05, 1.05)
        ax.set_title(title)
        ax.set_xlabel("minutes depuis le début de l'essai")
        ax.legend(fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(FIG / "verifier_timelines.png", dpi=130)
    plt.close(fig)
    print("figures written to", FIG)


if __name__ == "__main__":
    main()
