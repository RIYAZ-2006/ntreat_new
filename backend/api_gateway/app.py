import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import requests
import json
import re
from shared.config import Config

app = Flask(__name__)

CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY
app.config['MONGO_URI'] = Config.MONGO_URI

jwt = JWTManager(app)

_EXCLUDED_REQUEST_HEADERS = {'host', 'content-length', 'connection', 'transfer-encoding'}
_EXCLUDED_RESPONSE_HEADERS = {'content-encoding', 'content-length', 'transfer-encoding', 'connection'}


def proxy_request(service_url, path):
    url = f"{service_url}/{path}"
    headers = {k: v for k, v in request.headers if k.lower() not in _EXCLUDED_REQUEST_HEADERS}

    data = request.get_data()

    if request.is_json and request.content_length:
        try:
            req_json = request.get_json()
            if req_json and 'domain' in req_json and isinstance(req_json['domain'], str):
                clean_domain = re.sub(r'^https?://', '', req_json['domain']).rstrip('/')
                req_json['domain'] = clean_domain
                data = json.dumps(req_json).encode('utf-8')
                headers['Content-Type'] = 'application/json'
        except Exception as e:
            app.logger.warning(f"Failed to sanitize domain in request body: {e}")

    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=data,
            cookies=request.cookies,
            allow_redirects=False,
            params=request.args,
            timeout=30
        )
        response_headers = [(name, value) for (name, value) in resp.raw.headers.items()
                            if name.lower() not in _EXCLUDED_RESPONSE_HEADERS]
        return (resp.content, resp.status_code, response_headers)

    except requests.exceptions.Timeout:
        return jsonify({"error": "Service timed out"}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Service unavailable"}), 503
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Proxy error: {str(e)}"}), 502


@app.route('/')
def home():
    return jsonify({
        "status": "success",
        "message": "Welcome to the NTREAT API Gateway",
        "service": "api-gateway"
    })


@app.route('/health')
def health():
    return jsonify({
        "status": "healthy",
        "service": "api-gateway"
    })


@app.route('/auth/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def auth_proxy(path):
    return proxy_request(Config.AUTH_SERVICE_URL, path)


@app.route('/orchrestator/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def orchestrator_proxy(path):
    return proxy_request(Config.ORCHRESTATOR_SERVICE_URL, path)


@app.route('/scoring/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def scoring_proxy(path):
    return proxy_request(Config.SCORING_SERVICE_URL, path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_GATEWAY)