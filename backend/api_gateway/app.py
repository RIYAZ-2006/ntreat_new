import sys
import os

# Add the parent directory to sys.path to allow imports from shared
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import requests
import json
import re
from shared.config import Config

app = Flask(__name__)

# Enable CORS for all routes with permissive settings for development
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Configuration
app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY
app.config['MONGO_URI'] = Config.MONGO_URI

# Initialize JWT
jwt = JWTManager(app)

def proxy_request(service_url, path):
    """
    Helper function to proxy requests to backend services
    """
    url = f"{service_url}/{path}"
    # Forward the method, headers, and data/json
    # Note: excluding host/content-length to avoid conflicts
    headers = {key: value for (key, value) in request.headers if key != 'Host'}
    
    data = request.get_data()
    
    # Sanitize domain in JSON body
    if request.is_json and request.content_length:
        try:
            req_json = request.get_json()
            if req_json and 'domain' in req_json and isinstance(req_json['domain'], str):
                # Remove protocol and trailing slashes
                clean_domain = re.sub(r'^https?://', '', req_json['domain']).rstrip('/')
                req_json['domain'] = clean_domain
                data = json.dumps(req_json).encode('utf-8')
                # Adjust content-type if needed, though usually preserved
                headers['Content-Length'] = str(len(data))
                headers['Content-Type'] = 'application/json'
        except Exception:
            pass # Fallback to original data if parsing fails
    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=data,
            cookies=request.cookies,
            allow_redirects=False,
            params=request.args
        )
        # Return response from service
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [(name, value) for (name, value) in resp.raw.headers.items()
                   if name.lower() not in excluded_headers]
        return (resp.content, resp.status_code, headers)
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Service unavailable"}), 503

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
# @jwt_required() # Uncomment when auth is fully integrated in frontend
def orchrestator_proxy(path):
    return proxy_request(Config.ORCHRESTATOR_SERVICE_URL, path)







if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_GATEWAY)
