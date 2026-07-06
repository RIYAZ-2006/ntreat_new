import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'super-secret-key')
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/ntreat')
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    # CELERY_BROKER_URL = os.getenv(
    #     'CELERY_BROKER_URL',
    #     REDIS_URL
    # )

    # CELERY_RESULT_BACKEND = os.getenv(
    #     'CELERY_RESULT_BACKEND',
    #     REDIS_URL
    # )

    
    # # Service Ports
    # PORT_GATEWAY = int(os.getenv('PORT_GATEWAY', 5000))
    # PORT_AUTH = int(os.getenv('PORT_AUTH', 5001))
    # PORT_SUBDOMAIN = int(os.getenv('PORT_SUBDOMAIN', 5002))
    # PORT_DNS = int(os.getenv('PORT_DNS', 5003))
    # PORT_IP = int(os.getenv('PORT_IP', 5004))
    # PORT_SSL = int(os.getenv('PORT_SSL', 5005))
    # PORT_CVE = int(os.getenv('PORT_CVE', 5006))
    # PORT_SUBDIRECTORY = int(os.getenv('PORT_SUBDIRECTORY', 5007))
    # PORT_WEBTECH = int(os.getenv('PORT_WEBTECH', 5008))
    # PORT_SCORING = int(os.getenv('PORT_SCORING', 5009))
    # PORT_HTTP_SECURITY = int(os.getenv('PORT_HTTPSECURITY', 5010))
    PORT_ORCHRESTATOR = int(os.getenv('PORT_ORCHRESTATOR',5011))

    # URLs
    # AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', f"http://localhost:{PORT_AUTH}")
    # DNS_SERVICE_URL = os.getenv('DNS_SERVICE_URL', f"http://localhost:{PORT_DNS}")
    # IP_SERVICE_URL = os.getenv('IP_SERVICE_URL', f"http://localhost:{PORT_IP}")
    # SUBDOMAIN_SERVICE_URL = os.getenv('SUBDOMAIN_SERVICE_URL', f"http://localhost:{PORT_SUBDOMAIN}")
    # SSL_SERVICE_URL = os.getenv('SSL_SERVICE_URL', f"http://localhost:{PORT_SSL}")
    # CVE_SERVICE_URL = os.getenv('CVE_SERVICE_URL', f"http://localhost:{PORT_CVE}")
    # SUBDIRECTORY_SERVICE_URL = os.getenv('SUBDIRECTORY_SERVICE_URL', f"http://localhost:{PORT_SUBDIRECTORY}")
    # WEBTECH_SERVICE_URL = os.getenv('WEBTECH_SERVICE_URL', f"http://localhost:{PORT_WEBTECH}")
    # SCORING_SERVICE_URL = os.getenv('SCORING_SERVICE_URL', f"http://localhost:{PORT_SCORING}")
    # HTTP_SECURITY_SERVICE_URL = os.getenv('HTTP_SECURITY_SERVICE_URL', f"http://localhost:{PORT_HTTP_SECURITY}")
    ORCHRESTATOR_SERVICE_URL = os.getenv('ORCHRESTATOR_SERVICE_URL',f"http://localhost:{PORT_ORCHRESTATOR}")
