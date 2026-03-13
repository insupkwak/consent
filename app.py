from flask import Flask, render_template, request, jsonify, send_from_directory, abort
import json
import os
import tempfile
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 서버환경
DATA_DIR = "/home/opc/data/consent"
DATA_FILE = os.path.join(DATA_DIR, "vessels.json")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads", "consent_letters")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# PC 환경
# DATA_FILE = os.path.join(BASE_DIR, "vessels.json")
# UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "consent_letters")
# os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def load_vessels():
    if not os.path.exists(DATA_FILE):
        return []

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception:
        return []


def save_vessels_atomic(vessels):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)

    fd, temp_path = tempfile.mkstemp(
        dir=os.path.dirname(DATA_FILE),
        prefix="vessels_",
        suffix=".tmp"
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(vessels, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())

        os.replace(temp_path, DATA_FILE)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def normalize_vessel_data(data, old_vessel=None):
    old_vessel = old_vessel or {}

    return {
        "name": str(data.get("name", "")).strip(),
        "fujairahConsent": str(data.get("fujairahConsent", old_vessel.get("fujairahConsent", "동의"))).strip(),
        "yanbuConsent": str(data.get("yanbuConsent", old_vessel.get("yanbuConsent", "동의"))).strip(),
        "consentLetter": str(data.get("consentLetter", old_vessel.get("consentLetter", "확보"))).strip(),
        "voyagePlan": str(data.get("voyagePlan", old_vessel.get("voyagePlan", ""))).strip(),
        "crewPlanStatus": str(data.get("crewPlanStatus", old_vessel.get("crewPlanStatus", "불요"))).strip(),
        "crewCount": str(data.get("crewCount", old_vessel.get("crewCount", ""))).strip(),
        "crewDate": str(data.get("crewDate", old_vessel.get("crewDate", ""))).strip(),
        "crewPort": str(data.get("crewPort", old_vessel.get("crewPort", ""))).strip(),
        "crewPlanDetail": str(data.get("crewPlanDetail", old_vessel.get("crewPlanDetail", ""))).strip(),
        "bonusCount": str(data.get("bonusCount", old_vessel.get("bonusCount", ""))).strip(),
        "bonusAmount": str(data.get("bonusAmount", old_vessel.get("bonusAmount", ""))).strip(),
        "latitude": data.get("latitude", old_vessel.get("latitude", "")),
        "longitude": data.get("longitude", old_vessel.get("longitude", "")),
        "consentFile": old_vessel.get("consentFile", "")
    }


def get_asset_version():
    paths = [
        os.path.join(BASE_DIR, "templates", "index.html"),
        os.path.join(BASE_DIR, "templates", "report.html"),
        os.path.join(app.static_folder, "js", "app.js"),
        os.path.join(app.static_folder, "css", "style.css"),
        DATA_FILE
    ]

    mtimes = []
    for path in paths:
        if os.path.exists(path):
            mtimes.append(str(int(os.path.getmtime(path))))

    return "-".join(mtimes) if mtimes else "1"


def normalize_report_value(value, default="-"):
    text = str(value or "").strip()
    return text if text else default


def build_report_rows(vessels):
    rows = []
    for vessel in vessels:
        rows.append({
            "name": normalize_report_value(vessel.get("name")),
            "fujairahConsent": normalize_report_value(vessel.get("fujairahConsent")),
            "yanbuConsent": normalize_report_value(vessel.get("yanbuConsent")),
            "consentLetter": normalize_report_value(vessel.get("consentLetter")),
            "voyagePlan": normalize_report_value(vessel.get("voyagePlan")),
            "crewPlanStatus": normalize_report_value(vessel.get("crewPlanStatus"), "불요"),
            "crewCount": normalize_report_value(vessel.get("crewCount")),
            "crewDate": normalize_report_value(vessel.get("crewDate")),
            "crewPort": normalize_report_value(vessel.get("crewPort")),
            "crewPlanDetail": normalize_report_value(vessel.get("crewPlanDetail")),
        })
    return rows


def report_summary(vessels):
    return {
        "total": len(vessels),
        "fujairah_yes": sum(1 for v in vessels if str(v.get("fujairahConsent", "")).strip() == "동의"),
        "yanbu_yes": sum(1 for v in vessels if str(v.get("yanbuConsent", "")).strip() == "동의"),
        "no_consent": sum(1 for v in vessels if str(v.get("consentLetter", "")).strip() == "미확보"),
        "crew_confirmed": sum(1 for v in vessels if str(v.get("crewPlanStatus", "")).strip() == "확정"),
        "crew_pending": sum(1 for v in vessels if str(v.get("crewPlanStatus", "")).strip() == "미정"),
    }


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Surrogate-Control"] = "no-store"
    return response


@app.route("/")
def index():
    return render_template("index.html", version=get_asset_version())


@app.route("/report")
def report():
    vessels = load_vessels()
    rows = build_report_rows(vessels)
    summary = report_summary(vessels)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return render_template(
        "report.html",
        version=get_asset_version(),
        rows=rows,
        summary=summary,
        generated_at=generated_at
    )


@app.route("/api/vessels", methods=["GET"])
def get_vessels():
    return jsonify(load_vessels())


@app.route("/api/vessel", methods=["POST"])
def save_single_vessel():
    try:
        data = request.get_json(silent=True) or {}

        vessel_name = str(data.get("name", "")).strip()
        original_name = str(data.get("_originalName", "")).strip()

        if not vessel_name:
            return jsonify({"success": False, "message": "선박명이 없습니다."}), 400

        try:
            latitude = float(data.get("latitude"))
            longitude = float(data.get("longitude"))
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "위도 또는 경도 값이 올바르지 않습니다."}), 400

        vessels = load_vessels()

        target_index = None
        old_vessel = None

        if original_name:
            for i, vessel in enumerate(vessels):
                if str(vessel.get("name", "")).strip().lower() == original_name.lower():
                    target_index = i
                    old_vessel = vessel
                    break

        if target_index is None:
            for i, vessel in enumerate(vessels):
                if str(vessel.get("name", "")).strip().lower() == vessel_name.lower():
                    target_index = i
                    old_vessel = vessel
                    break

        normalized = normalize_vessel_data(data, old_vessel)
        normalized["latitude"] = latitude
        normalized["longitude"] = longitude

        if target_index is not None:
            vessels[target_index] = normalized
        else:
            vessels.append(normalized)

        save_vessels_atomic(vessels)
        return jsonify({"success": True, "message": "저장 완료"})
    except Exception as e:
        return jsonify({"success": False, "message": f"저장 중 오류: {str(e)}"}), 500


@app.route("/api/vessel/<path:vessel_name>", methods=["DELETE"])
def delete_single_vessel(vessel_name):
    try:
        target_name = vessel_name.strip().lower()
        vessels = load_vessels()

        new_vessels = [
            vessel for vessel in vessels
            if str(vessel.get("name", "")).strip().lower() != target_name
        ]

        if len(new_vessels) == len(vessels):
            return jsonify({"success": False, "message": "삭제할 선박을 찾지 못했습니다."}), 404

        save_vessels_atomic(new_vessels)
        return jsonify({"success": True, "message": "삭제 완료"})
    except Exception as e:
        return jsonify({"success": False, "message": f"삭제 중 오류: {str(e)}"}), 500


@app.route("/api/upload-consent", methods=["POST"])
def upload_consent():
    try:
        vessel_name = request.form.get("vesselName", "").strip()
        file = request.files.get("file")

        if not vessel_name:
            return jsonify({"success": False, "message": "선박명이 없습니다."}), 400

        if not file or file.filename == "":
            return jsonify({"success": False, "message": "업로드할 파일이 없습니다."}), 400

        if not allowed_file(file.filename):
            return jsonify({"success": False, "message": "허용되지 않는 파일 형식입니다."}), 400

        vessels = load_vessels()

        target_index = None
        for i, vessel in enumerate(vessels):
            if str(vessel.get("name", "")).strip().lower() == vessel_name.lower():
                target_index = i
                break

        if target_index is None:
            return jsonify({"success": False, "message": "해당 선박을 찾을 수 없습니다."}), 404

        ext = file.filename.rsplit(".", 1)[1].lower()
        safe_name = secure_filename(vessel_name.upper().replace(" ", "_"))
        new_filename = f"{safe_name}.{ext}"
        save_path = os.path.join(UPLOAD_DIR, new_filename)

        old_filename = str(vessels[target_index].get("consentFile", "")).strip()
        if old_filename:
            old_path = os.path.join(UPLOAD_DIR, old_filename)
            if os.path.exists(old_path) and old_filename != new_filename:
                try:
                    os.remove(old_path)
                except Exception:
                    pass

        file.save(save_path)

        vessels[target_index]["consentFile"] = new_filename
        save_vessels_atomic(vessels)

        return jsonify({
            "success": True,
            "message": "동의서 업로드 완료",
            "filename": new_filename
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"업로드 중 오류: {str(e)}"}), 500


@app.route("/uploads/consent_letters/<path:filename>")
def uploaded_consent_file(filename):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        abort(404)

    response = send_from_directory(UPLOAD_DIR, filename, as_attachment=False, conditional=False)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)