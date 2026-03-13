from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 서버환경
DATA_DIR = "/home/opc/data/consent"
DATA_FILE = os.path.join(DATA_DIR, "vessels.json")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads", "consent_letters")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp"}

# PC 환경
# DATA_FILE = os.path.join(BASE_DIR, "vessels.json")
# UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "consent_letters")
# os.makedirs(UPLOAD_DIR, exist_ok=True)
# ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp"}


def load_vessels():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def save_vessels(vessels):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(vessels, f, ensure_ascii=False, indent=2)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def safe_vessel_filename(vessel_name, ext):
    safe_name = secure_filename(vessel_name.strip()) or "vessel"
    return f"{safe_name}.{ext.lower()}"


def find_existing_file(vessel_name):
    safe_name = secure_filename(vessel_name.strip()) or "vessel"
    if not os.path.exists(UPLOAD_DIR):
        return None

    for filename in os.listdir(UPLOAD_DIR):
        base, ext = os.path.splitext(filename)
        if base == safe_name:
            return filename
    return None


def normalize_vessel(vessel):
    return {
        "name": (vessel.get("name") or "").strip(),
        "fujairahConsent": vessel.get("fujairahConsent", "확인중"),
        "yanbuConsent": vessel.get("yanbuConsent", "확인중"),
        "consentLetter": vessel.get("consentLetter", "미확보"),
        "consentFile": vessel.get("consentFile", ""),
        "crewPlanStatus": vessel.get("crewPlanStatus", "불요"),
        "crewCount": vessel.get("crewCount", ""),
        "crewDate": vessel.get("crewDate", ""),
        "crewPort": vessel.get("crewPort", ""),
        "crewPlanDetail": vessel.get("crewPlanDetail", ""),
        "bonusCount": vessel.get("bonusCount", ""),
        "bonusAmount": vessel.get("bonusAmount", ""),
        "latitude": vessel.get("latitude", ""),
        "longitude": vessel.get("longitude", "")
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/vessels", methods=["GET"])
def get_vessels():
    vessels = load_vessels()

    for vessel in vessels:
        existing = find_existing_file(vessel.get("name", ""))
        vessel["consentFile"] = existing if existing else ""

    return jsonify(vessels)


@app.route("/api/vessel", methods=["POST"])
def save_single_vessel():
    incoming = request.get_json(force=True)

    if not isinstance(incoming, dict):
        return jsonify({"success": False, "message": "데이터 형식이 올바르지 않습니다."}), 400

    vessel_name = (incoming.get("name") or "").strip()
    if not vessel_name:
        return jsonify({"success": False, "message": "선박명은 필수입니다."}), 400

    # 저장 직전에 최신 JSON 다시 읽기
    vessels = load_vessels()

    normalized = normalize_vessel(incoming)

    existing_file = find_existing_file(vessel_name)
    normalized["consentFile"] = existing_file if existing_file else normalized.get("consentFile", "")

    updated = False
    old_name = (incoming.get("_originalName") or "").strip()

    for i, vessel in enumerate(vessels):
        current_name = (vessel.get("name") or "").strip()

        if old_name:
            if current_name.lower() == old_name.lower():
                # 이름이 바뀌는 경우 기존 업로드 파일명도 같이 변경
                if old_name.lower() != vessel_name.lower():
                    old_file = find_existing_file(old_name)
                    if old_file:
                        old_path = os.path.join(UPLOAD_DIR, old_file)
                        ext = old_file.rsplit(".", 1)[1].lower()
                        new_filename = safe_vessel_filename(vessel_name, ext)
                        new_path = os.path.join(UPLOAD_DIR, new_filename)
                        if os.path.exists(old_path):
                            os.replace(old_path, new_path)
                        normalized["consentFile"] = new_filename
                vessels[i] = normalized
                updated = True
                break
        else:
            if current_name.lower() == vessel_name.lower():
                vessels[i] = normalized
                updated = True
                break

    if not updated:
        vessels.append(normalized)

    save_vessels(vessels)

    return jsonify({"success": True, "message": "저장되었습니다."})


@app.route("/api/vessel/<path:vessel_name>", methods=["DELETE"])
def delete_single_vessel(vessel_name):
    vessel_name = vessel_name.strip()
    vessels = load_vessels()

    new_vessels = [
        v for v in vessels
        if (v.get("name") or "").strip().lower() != vessel_name.lower()
    ]

    if len(new_vessels) == len(vessels):
        return jsonify({"success": False, "message": "삭제할 선박을 찾지 못했습니다."}), 404

    save_vessels(new_vessels)

    old_file = find_existing_file(vessel_name)
    if old_file:
        old_path = os.path.join(UPLOAD_DIR, old_file)
        if os.path.exists(old_path):
            os.remove(old_path)

    return jsonify({"success": True, "message": "삭제되었습니다."})


@app.route("/api/upload-consent", methods=["POST"])
def upload_consent():
    vessel_name = request.form.get("vesselName", "").strip()
    file = request.files.get("file")

    if not vessel_name:
        return jsonify({"success": False, "message": "선박명이 없습니다."}), 400

    if not file or file.filename == "":
        return jsonify({"success": False, "message": "업로드할 파일이 없습니다."}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "message": "허용되지 않는 파일 형식입니다."}), 400

    old_file = find_existing_file(vessel_name)
    if old_file:
        old_path = os.path.join(UPLOAD_DIR, old_file)
        if os.path.exists(old_path):
            os.remove(old_path)

    ext = file.filename.rsplit(".", 1)[1].lower()
    new_filename = safe_vessel_filename(vessel_name, ext)
    save_path = os.path.join(UPLOAD_DIR, new_filename)
    file.save(save_path)

    # 업로드 직전에 최신 json 다시 읽고 해당 선박만 반영
    vessels = load_vessels()
    updated = False

    for vessel in vessels:
        if (vessel.get("name") or "").strip().lower() == vessel_name.lower():
            vessel["consentFile"] = new_filename
            vessel["consentLetter"] = "확보"
            updated = True
            break

    if not updated:
        vessels.append({
            "name": vessel_name,
            "fujairahConsent": "확인중",
            "yanbuConsent": "확인중",
            "consentLetter": "확보",
            "consentFile": new_filename,
            "crewPlanStatus": "불요",
            "crewCount": "",
            "crewDate": "",
            "crewPort": "",
            "crewPlanDetail": "",
            "bonusCount": "",
            "bonusAmount": "",
            "latitude": "",
            "longitude": ""
        })

    save_vessels(vessels)

    return jsonify({
        "success": True,
        "message": "동의서가 업로드되었습니다.",
        "filename": new_filename,
        "viewUrl": f"/uploads/consent_letters/{new_filename}"
    })


@app.route("/uploads/consent_letters/<path:filename>")
def uploaded_consent_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)