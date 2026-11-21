"""Build and SAVE the two models of the general + local architecture, with NIST as the example site.

  models/general_model.pkl     trained on the general data (Industrial Hall)
  models/local_model_NIST.pkl  general data + the NIST site's own recordings (its "pilot")
  models/models_card.json      what each model is, what it learned from, its measured results

Both use the 7 clues that exist on NIST (the example site has no H2 / VOC / CO2 sensors).
Run: python -I -m ai.external_test.build_site_models
"""
import json
import pickle

import pandas as pd

from ai.common.data import ROOT
from ai.external_test.nist_fr4019 import RED_FEATURES, hall_frame
from ai.external_test.site_adaptation import load_nist, train_site_model

OUT = ROOT / "models"


def main():
    OUT.mkdir(exist_ok=True)
    hf = hall_frame()
    general_rows = hf[(hf["episode"] != "") & hf["active"]]
    nist = load_nist()
    local_rows = pd.concat([w[w["active"]] for w in nist.values()], ignore_index=True)
    general = train_site_model(general_rows, None)
    local = train_site_model(general_rows, local_rows)
    pickle.dump(general, open(OUT / "general_model.pkl", "wb"))
    pickle.dump(local, open(OUT / "local_model_NIST.pkl", "wb"))
    res = json.loads((ROOT / "docs/results/site_adaptation.json").read_text(encoding="utf-8"))["summary"]
    card = {
        "features": RED_FEATURES,
        "general_model": {"file": "models/general_model.pkl", "learned_from": "Industrial Hall (Mendeley): 32 tests, 17 fires, 15 nuisances",
                          "rows": int(len(general_rows)), "result_on_new_site_NIST": res["A_general_only"]},
        "local_model_NIST": {"file": "models/local_model_NIST.pkl", "learned_from": "Industrial Hall + NIST site recordings (example of a 90-day pilot)",
                             "rows": int(len(general_rows) + len(local_rows)), "local_rows": int(len(local_rows)),
                             "result_on_NIST_tests_never_seen (leave-one-test-out)": res["B_general_plus_local_full_pilot"]},
        "note": "The deployed demo verifier (app/data/verifier_data.js) uses all 19 clues; these two files show the general+local mechanism on the example site.",
    }
    (OUT / "models_card.json").write_text(json.dumps(card, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: (v if k == "features" else {kk: vv for kk, vv in v.items() if kk in ("file", "rows")}) for k, v in card.items() if k != "note"}, indent=1))


if __name__ == "__main__":
    main()
