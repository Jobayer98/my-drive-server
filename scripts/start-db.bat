@echo off
echo Starting MongoDB container...
docker-compose up -d mongodb
echo MongoDB is starting on port 27017
echo Username: admin
echo Password: password