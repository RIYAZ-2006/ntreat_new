import sys
import os
import datetime

# Add the parent directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from shared.config import Config
from shared.database import get_db

app = Flask(__name__)

# Configuration
app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY

jwt = JWTManager(app)
db = get_db()
users_collection = db['users']

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "service": "auth"})

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    if users_collection.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 409

    password_hash = generate_password_hash(password)
    users_collection.insert_one({
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.datetime.utcnow()
    })

    return jsonify({"message": "User created successfully"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    user = users_collection.find_one({"email": email})
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = create_access_token(identity=email, expires_delta=datetime.timedelta(days=1))
    return jsonify({"access_token": access_token}), 200

@app.route('/me', methods=['GET'])
@jwt_required()
def me():
    current_user_email = get_jwt_identity()
    user = users_collection.find_one({"email": current_user_email}, {"_id": 0, "password_hash": 0})
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=Config.PORT_AUTH)
