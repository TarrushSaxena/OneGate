import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Explicit normalization layer based on repository semantics and KB taxonomy
# - IT Support -> IT
# - Cybersecurity -> IT (aligned with KB articles and L2 security engineers in fake-data)
# - HR -> HR
# - Finance -> Finance
# - Billing -> Finance (aligned with accounts payable & invoice handling in fake-data)
# Unmapped classes (Customer Support, Data & Analytics, Investor Relations, Legal, Marketing,
# Quality Assurance, Out of Scope, Unknown) map to None so Node can safely fallback.
CANONICAL_DEPARTMENT_MAPPING = {
    "IT Support": "IT",
    "Cybersecurity": "IT",
    "HR": "HR",
    "Finance": "Finance",
    "Billing": "Finance",
    "Facilities": "Facilities",
    "IT": "IT",
}

class DepartmentClassifier:
    def __init__(self, model_dir: str, device: torch.device = None):
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = device

        print(f"[DepartmentClassifier] Loading from {model_dir} on {self.device}...")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_dir)
        self.model.to(self.device)
        self.model.eval()

        # Dynamic id2label extraction from model config (never hard-code)
        self.id2label = {int(k): v for k, v in self.model.config.id2label.items()}
        print(f"[DepartmentClassifier] Ready with {len(self.id2label)} classes: {list(self.id2label.values())}")

    def predict(self, text: str, top_k: int = 5):
        if not text or not text.strip():
            raise ValueError("Query string cannot be empty")

        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
        # DistilBERT does not accept token_type_ids
        inputs.pop("token_type_ids", None)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=1)[0]

        k = min(top_k, len(self.id2label))
        top_probs, top_indices = torch.topk(probs, k=k)

        top_predictions = []
        for prob, idx in zip(top_probs, top_indices):
            label_name = self.id2label[idx.item()]
            top_predictions.append({
                "department": label_name,
                "confidence": round(float(prob.item()), 4)
            })

        best_raw = top_predictions[0]["department"]
        best_conf = top_predictions[0]["confidence"]
        canonical_dept = CANONICAL_DEPARTMENT_MAPPING.get(best_raw, None)

        return {
            "raw_department": best_raw,
            "department": canonical_dept,
            "department_confidence": best_conf,
            "department_top_predictions": top_predictions
        }
