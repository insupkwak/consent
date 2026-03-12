from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
from werkzeug.utils import secure_filename


app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# 써버환경
DATA_DIR = "/home/opc/data/consent"
DATA_FILE = os.path.join(DATA_DIR, "vessels.json")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads", "consent_letters")

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
            return json.load(f)
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
    for filename in os.listdir(UPLOAD_DIR):
        base, ext = os.path.splitext(filename)
        if base == safe_name:
            return filename
    return None


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


@app.route("/api/vessels", methods=["POST"])
def save_all_vessels():
    data = request.get_json(force=True)

    if not isinstance(data, list):
        return jsonify({"success": False, "message": "데이터 형식이 올바르지 않습니다."}), 400

    save_vessels(data)
    return jsonify({"success": True, "message": "저장되었습니다."})


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