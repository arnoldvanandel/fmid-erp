@echo off
rem Snelkoppeling: leverancier uit Axapta overzetten naar FMID ERP.
title Leverancier naar FMID ERP
cd /d "%~dp0"
:opnieuw
echo.
set "NUMMERS="
set /p NUMMERS=Leveranciersnummer(s) in Axapta (Enter = stoppen): 
if "%NUMMERS%"=="" goto :eof
python leverancier_overzetten.py %NUMMERS% --proef
if errorlevel 1 goto opnieuw
echo.
set "OK="
set /p OK=Overzetten naar FMID ERP? (j/n): 
if /i "%OK%"=="j" python leverancier_overzetten.py %NUMMERS%
goto opnieuw
