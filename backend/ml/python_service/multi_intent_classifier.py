import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MULTI_THRESHOLD = 0.60

class MultiIntentClassifier:
    def __init__(self, model_dir: str, device: torch.device = None):
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = device

        print(f"[MultiIntentClassifier] Loading from {model_dir} on {self.device}...")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_dir)
        self.model.to(self.device)
        self.model.eval()

        self.id2label = {int(k): v for k, v in self.model.config.id2label.items()}
        self.label2id = {v: k for k, v in self.id2label.items()}
        print(f"[MultiIntentClassifier] Ready with threshold {MULTI_THRESHOLD:.2f}. Classes: {self.id2label}")

    def predict(self, text: str):
        if not text or not text.strip():
            raise ValueError("Query string cannot be empty")

        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
        # DistilBERT does not accept token_type_ids
        inputs.pop("token_type_ids", None)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=1)[0]

        multi_id = self.label2id.get("MULTI", 1)
        single_id = self.label2id.get("SINGLE", 0)

        multi_prob = round(float(probs[multi_id].item()), 4)
        single_prob = round(float(probs[single_id].item()), 4)

        is_multi = multi_prob >= MULTI_THRESHOLD
        intent_type = "MULTI" if is_multi else "SINGLE"
        intent_confidence = multi_prob if is_multi else single_prob

        return {
            "intent_type": intent_type,
            "intent_confidence": intent_confidence,
            "multi_probability": multi_prob,
            "single_probability": single_prob,
            "multi_threshold": MULTI_THRESHOLD,
        }
