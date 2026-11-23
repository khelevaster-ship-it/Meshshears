@echo off
rem Opens MeshShears through a small local web server (needs Python: https://www.python.org/downloads/)
cd /d "%~dp0"
where py >nul 2>nul && (py -3 start.py & goto :eof)
where python >nul 2>nul && (python start.py & goto :eof)
echo Python was not found. Install it from https://www.python.org/downloads/ or just open index.html (the piece finder then uses one core).
pause
