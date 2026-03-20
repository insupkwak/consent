from flask import Flask, render_template, request, jsonify, send_from_directory, abort
import json
import os
import tempfile
import re
from datetime import datetime
from werkzeug.utils import secure_filename
from openpyxl import load_workbook

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


def normalize_name_for_match(name):
    return re.sub(r"\s+", " ", str(name or "").strip()).upper()


def excel_cell_str(value):
    if value is None:
        return ""
    return str(value).strip()


def safe_float(value):
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(value)
    except Exception:
        return None


def normalize_degree_text(text):
    text = str(text or "").strip()
    text = text.replace("º", "°")
    text = text.replace("˚", "°")
    text = text.replace("’", "'")
    text = text.replace("‘", "'")
    text = text.replace("＇", "'")
    text = text.replace("“", '"')
    text = text.replace("”", '"')
    text = text.replace("″", '"')
    text = text.replace("／", "/")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def dms_to_decimal(direction, degrees, minutes=0.0, seconds=0.0):
    value = float(degrees) + float(minutes) / 60.0 + float(seconds) / 3600.0
    direction = str(direction or "").upper().strip()
    if direction in {"S", "W"}:
        value = -value
    return value


def parse_excel_datetime(value):
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    if not text:
        return None

    patterns = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
    ]
    for fmt in patterns:
        try:
            return datetime.strptime(text, fmt)
        except Exception:
            continue
    return None


def parse_degree_minute_coordinate(degree, minute, hemisphere, coord_type):
    deg = safe_float(degree)
    minute_val = safe_float(minute)
    hemi = str(hemisphere or "").strip().upper()

    if deg is None or minute_val is None or hemi not in {"N", "S", "E", "W"}:
        return None

    value = abs(deg) + (minute_val / 60.0)

    if hemi in {"S", "W"}:
        value = -value

    if coord_type == "lat" and -90 <= value <= 90:
        return round(value, 6)
    if coord_type == "lon" and -180 <= value <= 180:
        return round(value, 6)

    return None


def normalize_header(text):
    return re.sub(r"[^a-z0-9가-힣]", "", str(text or "").strip().lower())


def find_header_index(headers, candidates):
    normalized = [normalize_header(h) for h in headers]
    candidate_set = {normalize_header(c) for c in candidates}
    for idx, header in enumerate(normalized):
        if header in candidate_set:
            return idx
    return None


def is_new_position_format(headers):
    def cell(idx):
        if idx >= len(headers):
            return ""
        return str(headers[idx] or "").strip().lower()

    return (
        cell(3) == "name"
        and cell(8) == "date(lt)"
        and cell(17) == "latitude"
        and cell(18) == "latitude"
        and cell(19) == "latitude"
        and cell(20) == "longitude"
        and cell(21) == "longitude"
        and cell(22) == "longitude"
    )


def parse_single_coord(token):
    """
    지원 예:
    - W3°20'45.912"
    - N 20° 15.13'
    - 36.03322667
    - E110.55
    """
    if token is None:
        raise ValueError("좌표값이 없습니다.")

    text = normalize_degree_text(token).upper().replace(",", "")
    text = text.strip()

    if not text:
        raise ValueError("좌표값이 비어 있습니다.")

    m = re.match(r"^([NSEW])\s*([0-9]+(?:\.[0-9]+)?)\s*$", text)
    if m:
        return dms_to_decimal(m.group(1), m.group(2), 0, 0)

    m = re.match(r"^([NSEW])\s*([0-9]+(?:\.[0-9]+)?)°\s*([0-9]+(?:\.[0-9]+)?)'\s*$", text)
    if m:
        return dms_to_decimal(m.group(1), m.group(2), m.group(3), 0)

    m = re.match(r"^([NSEW])\s*([0-9]+(?:\.[0-9]+)?)°\s*([0-9]+(?:\.[0-9]+)?)'\s*([0-9]+(?:\.[0-9]+)?)\"\s*$", text)
    if m:
        return dms_to_decimal(m.group(1), m.group(2), m.group(3), m.group(4))

    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*([NSEW])\s*$", text)
    if m:
        return dms_to_decimal(m.group(2), m.group(1), 0, 0)

    m = re.match(r"^([+-]?[0-9]+(?:\.[0-9]+)?)\s*$", text)
    if m:
        return float(m.group(1))

    raise ValueError(f"좌표 해석 실패: {token}")


def parse_combined_position(position_text):
    """
    지원 예:
    1) W3º20'45.912" / 36.03322667
    2) N 20° 15.13' E 110° 55.48'
    """
    text = normalize_degree_text(position_text).upper()

    if not text:
        raise ValueError("위치 문자열이 비어 있습니다.")

    if "/" in text:
        parts = [p.strip() for p in text.split("/") if p.strip()]
        if len(parts) != 2:
            raise ValueError("슬래시(/) 위치 형식이 올바르지 않습니다.")

        first = parse_single_coord(parts[0])
        second = parse_single_coord(parts[1])

        first_has_ns = bool(re.search(r"[NS]", parts[0]))
        first_has_ew = bool(re.search(r"[EW]", parts[0]))
        second_has_ns = bool(re.search(r"[NS]", parts[1]))
        second_has_ew = bool(re.search(r"[EW]", parts[1]))

        if first_has_ns:
            lat = first
            lon = second
        elif first_has_ew:
            lon = first
            lat = second
        elif second_has_ns:
            lon = first
            lat = second
        elif second_has_ew:
            lat = first
            lon = second
        else:
            if abs(first) <= 90 and abs(second) <= 180:
                lat = first
                lon = second
            else:
                lon = first
                lat = second

        return lat, lon

    pattern = r'([NSEW])\s*[0-9]+(?:\.[0-9]+)?(?:\s*°\s*[0-9]+(?:\.[0-9]+)?(?:\s*\'\s*[0-9]+(?:\.[0-9]+)?")?\'?)?'
    matches = list(re.finditer(pattern, text))

    if len(matches) >= 2:
        coord1 = matches[0].group(0).strip()
        coord2 = matches[1].group(0).strip()

        value1 = parse_single_coord(coord1)
        value2 = parse_single_coord(coord2)

        if coord1.startswith(("N", "S")):
            lat, lon = value1, value2
        else:
            lon, lat = value1, value2

        return lat, lon

    raise ValueError(f"지원되지 않는 위치 형식입니다: {position_text}")


def extract_position_from_row(row_dict):
    position_keys = ["위치", "좌표", "POSITION", "Position", "position", "LOCATION", "Location", "location"]
    lat_keys = ["위도", "LAT", "Lat", "lat", "LATITUDE", "Latitude", "latitude"]
    lon_keys = ["경도", "LON", "Lon", "lon", "LONGITUDE", "Longitude", "longitude"]

    for key in position_keys:
        if key in row_dict and excel_cell_str(row_dict.get(key)):
            return parse_combined_position(row_dict.get(key))

    lat_val = None
    lon_val = None

    for key in lat_keys:
        if key in row_dict and excel_cell_str(row_dict.get(key)):
            lat_val = parse_single_coord(row_dict.get(key))
            break

    for key in lon_keys:
        if key in row_dict and excel_cell_str(row_dict.get(key)):
            lon_val = parse_single_coord(row_dict.get(key))
            break

    if lat_val is not None and lon_val is not None:
        return lat_val, lon_val

    raise ValueError("위치 또는 위도/경도 컬럼을 찾지 못했습니다.")


def pick_latest_position_rows(sheet):
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return {}, 0, 0, 0

    def parse_with_header_row(header_row_index):
        if len(rows) <= header_row_index:
            return {}, 0, 0, 0

        headers = [excel_cell_str(h) for h in rows[header_row_index]]
        data_rows = rows[header_row_index + 1:]

        if not headers:
            raise ValueError("헤더 행을 찾을 수 없습니다.")

        latest_by_name = {}
        total_rows = 0
        invalid_count = 0
        skipped_empty_name = 0

        # 새 양식 처리
        if is_new_position_format(headers):
            for row in data_rows:
                if not row:
                    continue

                raw_name = row[3] if len(row) > 3 else None
                vessel_name = excel_cell_str(raw_name)

                if not vessel_name:
                    skipped_empty_name += 1
                    continue

                total_rows += 1

                dt_value = parse_excel_datetime(row[8] if len(row) > 8 else None)

                lat = parse_degree_minute_coordinate(
                    row[17] if len(row) > 17 else None,
                    row[18] if len(row) > 18 else None,
                    row[19] if len(row) > 19 else None,
                    "lat",
                )

                lon = parse_degree_minute_coordinate(
                    row[20] if len(row) > 20 else None,
                    row[21] if len(row) > 21 else None,
                    row[22] if len(row) > 22 else None,
                    "lon",
                )

                if lat is None or lon is None:
                    invalid_count += 1
                    continue

                key = normalize_name_for_match(vessel_name)
                item = {
                    "name": vessel_name,
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "dt": dt_value,
                }

                current = latest_by_name.get(key)
                if current is None:
                    latest_by_name[key] = item
                    continue

                current_dt = current.get("dt")
                if dt_value and current_dt:
                    if dt_value >= current_dt:
                        latest_by_name[key] = item
                elif dt_value and not current_dt:
                    latest_by_name[key] = item
                elif not dt_value and not current_dt:
                    latest_by_name[key] = item

            return latest_by_name, total_rows, invalid_count, skipped_empty_name

        # 구 양식 처리
        name_idx = find_header_index(headers, [
            "선명", "선박명", "ship name", "shipname", "vesselname", "vessel", "name"
        ])
        date_idx = find_header_index(headers, [
            "date", "일자", "날짜", "시간", "datetime", "updatedate", "updatetime"
        ])
        lat_idx = find_header_index(headers, [
            "latitude", "lat", "위도"
        ])
        lon_idx = find_header_index(headers, [
            "longitude", "lon", "lng", "경도"
        ])
        position_idx = find_header_index(headers, [
            "위치", "position", "pos", "location", "좌표"
        ])

        if name_idx is None:
            raise ValueError("엑셀 헤더에서 선명 또는 선박명을 찾을 수 없습니다.")

        if lat_idx is None and lon_idx is None and position_idx is None:
            raise ValueError("엑셀 헤더에서 위도/경도 또는 위치 컬럼을 찾을 수 없습니다.")

        for row in data_rows:
            if not row:
                continue

            row_dict = {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
            vessel_name = excel_cell_str(row[name_idx] if name_idx < len(row) else None)

            if not vessel_name:
                skipped_empty_name += 1
                continue

            total_rows += 1
            dt_value = None

            if date_idx is not None and date_idx < len(row):
                dt_value = parse_excel_datetime(row[date_idx])

            try:
                lat, lon = extract_position_from_row(row_dict)
            except Exception:
                invalid_count += 1
                continue

            if abs(lat) > 90 or abs(lon) > 180:
                invalid_count += 1
                continue

            key = normalize_name_for_match(vessel_name)
            item = {
                "name": vessel_name,
                "latitude": float(lat),
                "longitude": float(lon),
                "dt": dt_value,
            }

            current = latest_by_name.get(key)
            if current is None:
                latest_by_name[key] = item
                continue

            current_dt = current.get("dt")
            if dt_value and current_dt:
                if dt_value >= current_dt:
                    latest_by_name[key] = item
            elif dt_value and not current_dt:
                latest_by_name[key] = item
            elif not dt_value and not current_dt:
                latest_by_name[key] = item

        return latest_by_name, total_rows, invalid_count, skipped_empty_name

    # 1순위: 2행 헤더 시도
    try:
        result = parse_with_header_row(1)
        parsed_map, total_rows, invalid_count, skipped_empty_name = result
        if parsed_map or total_rows > 0:
            return result
    except ValueError:
        pass

    # 2순위: 1행 헤더 시도
    return parse_with_header_row(0)


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


@app.route("/api/upload-positions", methods=["POST"])
def upload_positions():
    try:
        file = request.files.get("file")

        if not file or file.filename == "":
            return jsonify({"success": False, "message": "업로드할 엑셀 파일이 없습니다."}), 400

        if not file.filename.lower().endswith(".xlsx"):
            return jsonify({"success": False, "message": "xlsx 파일만 업로드할 수 있습니다."}), 400

        workbook = load_workbook(file, data_only=True)
        sheet = workbook.active

        latest_by_name, total_rows, invalid_count, skipped_empty_name = pick_latest_position_rows(sheet)

        vessels = load_vessels()
        vessel_map = {
            normalize_name_for_match(v.get("name", "")): i
            for i, v in enumerate(vessels)
        }

        updated_count = 0
        not_found_count = 0

        for normalized_name, item in latest_by_name.items():
            target_index = vessel_map.get(normalized_name)
            if target_index is None:
                not_found_count += 1
                continue

            lat = item["latitude"]
            lon = item["longitude"]

            if abs(lat) > 90 or abs(lon) > 180:
                invalid_count += 1
                continue

            vessels[target_index]["latitude"] = float(lat)
            vessels[target_index]["longitude"] = float(lon)
            updated_count += 1

        save_vessels_atomic(vessels)

        return jsonify({
            "success": True,
            "message": "위치 업데이트 완료",
            "totalRows": total_rows,
            "updatedCount": updated_count,
            "notFoundCount": not_found_count,
            "invalidCount": invalid_count,
            "skippedEmptyName": skipped_empty_name
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"위치 업데이트 중 오류: {str(e)}"}), 500


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