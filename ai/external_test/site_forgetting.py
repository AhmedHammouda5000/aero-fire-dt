"""Does local learning make the AI forget the original site? Hall leave-one-episode-out with the
reduced 7 features, trained (a) on the hall only and (b) on the hall + ALL NIST tests. Same voting rule.
Run: python -I -m ai.external_test.site_forgetting -> docs/results/site_forgetting.json"""
import json

import pandas as pd

from ai.alarm_verifier import verifier as V
from ai.common.data import ROOT
from ai.external_test.nist_fr4019 import RED_FEATURES, hall_frame, verdict_of
from ai.external_test.site_adaptation import load_nist, train_site_model


def main():
    hf = hall_frame()
    rows = hf[(hf["episode"] != "") & hf["active"]]
    nist = load_nist(); local = pd.concat([w[w["active"]] for w in nist.values()], ignore_index=True)
    eps = rows.groupby("episode")["label"].first()
    res = {"hall_only": {}, "hall_plus_nist": {}}
    for e, lab in eps.items():
        tr = rows[rows["episode"] != e]
        win = hf[(hf["episode"] == e)].sort_values(["Date", "node"])
        for k, loc in (("hall_only", None), ("hall_plus_nist", local)):
            m = train_site_model(tr, loc)
            tl = V.hall_timeline(win, m.predict_proba(win[RED_FEATURES].values)[:, 1])
            res[k][e] = {"label": lab, "verdict": verdict_of(tl)}
    out = {}
    for k, d in res.items():
        f = [v for v in d.values() if v["label"] == "fire"]; n = [v for v in d.values() if v["label"] != "fire"]
        out[k] = {"hall_fires_confirmed": f"{sum(v['verdict'] == 'FIRE' for v in f)}/{len(f)}",
                  "hall_nuisances_not_fire": f"{sum(v['verdict'] != 'FIRE' for v in n)}/{len(n)}"}
    (ROOT / "docs/results/site_forgetting.json").write_text(json.dumps({"summary": out, "episodes": res}, indent=1), encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
