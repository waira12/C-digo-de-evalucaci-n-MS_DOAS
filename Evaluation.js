Measurement Parameter
MaxSZA = 97    ; Max. SZA for scattered light measurement 
MaxOffAxisSZA = 85 ; Max SZA for off-axis measurements
CalibSZA = 100  ; Min. SZA for calibration measurements; ExcludeAngle=0 disables checks
ExcludeAngle = 0 ; angle at which close to the sun no measurements should take place
ExcludeViewingDirection = 300; viewing direction of telescope (0 is north, 90 east, 180 south)
; ElevMode
; 1: each elevation angle and their respective scan number needs to be specified
; 2: Min, Max Elevation are given, with stepsize
ElevMode = 1; definitions for ElevMode = 1;
n_Elev = 9								; Number of ElevMotor angles
ElevDir = 1								; direction of elevation angles. 1 is "normal"				
ElevOffset = 0;							; is there an offset?
Elev = 90, 25, 22, 19, 16, 13, 10, 7, 4   	; ElevMotor angle sequence
texp_uv_default = 500,500,500,500,500,500,500,500,500;		// default exposure times, will be changed while program is running
texp_uv = texp_uv_default;
definitions for ElevMode = 2;
ElevMin = 10
ElevMax = 170
ElevStep = 10
insert here latitude and longitude. This information is crucial to calculate the correct sun position
lat = 6.20
lon = -75.57
Aquisition Mode:
; 1:   Total integration time per elevation angle is fixed, exposure time is adjusted according to saturation
; 2:   Total scan number per elevation time is fixed, exposure time is adjusted according to saturation
SpecAquMode = 1
; The desired saturation of the spectrum
SpecSaturation = 50;
; for SpecAquMode = 1 
; Time per elevation angle for a SZA lower than 80, 90, 92 degrees
; and a default value (in milliseconds)
TimePerElev80 = 60000 
TimePerElev90 = 70000 
TimePerElev92 = 100000 
TimePerElev   = 60000 
; for SpecAquMode = 2
; Number of scans per Elevation angle
ScansPerElev = 100
; for Webcam images:
; WebcamStep: every x-th spectrum a webcam image is taken
; WebcamRefOnly: Only once per elevation angle sequence, WebcamStep is ignored
; WebcamSwitchOff: Switches off the webcam between pictures. Takes more time.
WebcamEnable = 1
WebcamStep = 1
WebcamRefOnly = 1
WebcamSwitchOff = 1
; due to a bug in the SZA routine of MSDOAS, sometimes calibration measurements are done during the day around noon.
; as a bugfix, you can specify whenever there should be no calibration measurements,
; e.g. in Europe between 10-14 UTC
nocalib_start = 10
nocalib_end = 14
; settings for atuomatic calibration measurements
time_per_calib_spec = 60000
texp_dc = 10000
texp_ofs = 10
texp_hg_uv = 300
texp_hg334_uv = 5000
number_of_spec = 3;

; If ref, then don't consider step size
if WebcamEnable>0
if WebcamRefOnly > 0
   WebcamStep = 1;
endif

if WebcamSwitchOff<1
  Webcam.capture = true;
endif
endif

if ~G_Temperature.busy
  G_Temperature.go;
endif

ClockSetInterval = 1.0 ; Interval to set computer time to GPS (in days)
LastClockSet = 0  ;   Time of last clock set

SpectrumCount = 0;
WebcamLast = 0;

ElevNdx = 0
FirstMeasurement = True  ; true if first scattered light measurement

; Turn on cooling of spectrometer 1
Cooling.stop
Pause 100
Cooling.go


; check if min-max elevations are correctly defined
if ElevMin < -10
	ElevMin = -10;
endif
if ElevMax >190
	ElevMax = 190;
endif
if ElevMin > ElevMax
	a = ElevMin;
	ElevMin = ElevMax;
	ElevMax = a;
endif
if ElevStep > ElevMax-ElevMin 
	ElevStep = ElevMax-ElevMin;
endif

Pause 3000

; dont start templog since we do it manually once we refreshed the temperature data which is only possible when not using the spectrometer
if ~TempLog.busy
  TempLog.stop ; Temperature logging
endif

; Measurement Sequence

label sequence

if date + time > LastClockSet + ClockSetInterval
  ; set computer time to GPS time
  LastClockSet = date + time
  GPS.setsystemtime
;  logmsg("System time adjusted to GPS")
endif

if SZA < MaxSZA  ; scattered light measurements during the day
  gosub ScatteredLight  
endif
else
  if SZA > CalibSZA ; calibration measurements at night
    gosub Calibration
    while SZA > CalibSZA ; just do it once
      pause 10000;
    endwhile
  endif
  else
    FirstMeasurement = True
  endelse
endelse

goto sequence  ; end of measurement sequence

label ScatteredLight ; scattered light measurements during the day

  If FirstMeasurement 
    ;ElevMotor.Init ; move to end switch
    ;ElevMotor.WaitFor

    ElevMotor.NPos = ElevMin - ElevStep;
    ElevMotor.Go  
    ElevMotor.WaitFor
   
    ; set initial integration times
    UV.tExp = 151
    
    ; set saturation levels
    UV.Sat = SpecSaturation
    
    texp_uv = texp_uv_default;

    FirstMeasurement = False

    ; open servo and shut off hg lamp
    gosub SERVO_OPEN
    gosub HG_OFF
  endif

  ; Move motor to ElevMotor angle
  if ElevMode == 1
	  if SZA > MaxOffAxisSZA 
		ElevMotor.NPos = ElevOffset + ElevDir*90 ; Zenith sky measurements at twilight
	  endif
	  else
		ElevMotor.NPos = ElevOffset + ElevDir*Elev[ElevNdx]  ; set next position
	  endelse
  endif
  else
	; ElevMode = 2;
	ElevMotor.NPos = ElevMotor.NPos + ElevStep;
	if ElevMotor.NPos > ElevMax
		ElevMotor.NPos = ElevMin;
	endif
  endelse

  ; check for closeby sun
  if abs(90-SZA - ElevMotor.NPos) < ExcludeAngle
    if abs(SAA - ExcludeViewingDirection) < ExcludeAngle
      return;
    endif
  endif

  ElevMotor.Go   ; start movement
  ElevMotor.WaitFor  ; wait until movement finished
  pause 500; wait half a second before starting measurement
  ; Measurement mode: fixed time
  UV.acqmode = SpecAquMode
  
  if UV.acqmode == 1
	  ; Set total time depending on SZA
	  T = TimePerElev   ; total time for SZA > 92
	  if SZA < 92
		T = TimePerElev92
	  endif
	  if SZA < 90
		T = TimePerElev90
	  endif 
	  if SZA < 80
		T = TimePerElev80
	  endif 

	  UV.tTot = T
  endif
  
  if UV.acqmode == 2 
	UV.scans = ScansPerElev;
  endif
  
  if ElevMode == 1
	  ; set exposure time for elevation
	  UV.tExp = texp_uv[ElevNdx];
  endif
  
  ; start acquisition
  gosub dummy
  UV.go
  
  ; here we have time for the webcam!
  SpectrumCount = SpectrumCount + 1;
  gosub WebcamCapture;
  
  ; Log temperature while taking the spectrum (saves time)
  gosub LogTempInfo
  
  ; wait until finished
  UV.waitfor
  
  ; set spectrum names to ElevMotor angle
  UV.spec_name = %f(ElevMotor.NPos, 2) " " %f(ElevMotor.Pos, 2)
  
  ; save spectra
  UV.savespec

  ; calculate average Intensity for graph
  uv_min = UV.spec_min / UV.scans / UV.tExp
  uv_max = UV.spec_max / UV.scans / UV.tExp
  uv_avg = UV.spec_avg / UV.scans / UV.tExp

  ; start the Intensity graph if not done already
  if ~g_Intensity.busy
     G_Intensity.go;
  endif

  if ElevMode == 1  
	  ; store exposure time
	  texp_uv[ElevNdx] = UV.tExp;
  endif
  
 gosub LogSpecInfo

 if ElevMode == 1
	  ; choose next ElevMotor angle
	  elevndx = elevndx + 1
	  if elevndx >= n_Elev
		; we have a new elevation sequence
		elevndx = 0
	  endif 
  endif
return
  

label Calibration ; calibration and correction measurements during the night

if time > nocalib_start/24 & time < nocalib_end/24 ; bugfix for europe - don't do calibration around noon, seems to be a bug in MSDOAS
  gosub ScatteredLight
  return
endif

 ; drive elevation motor
    

    ElevMotor.npos = 90;
    ElevMotor.go
    ElevMotor.waitfor
 
    gosub Calibrate;
	
return 
; **** Log spectra information
label LogSpecInfo
  speclog.write(date" "time" "%f(SZA,2)" "%f(lat, 2)" "%f(lon, 2)" "%f(ElevMotor.npos, 2)" "%f(ElevMotor.pos, 2) " "%f(UV.spec_max,2)" "%f(UV.spec_min,2)" "%f(UV.spec_avg,2) )
return

label LogTempInfo
  
  templog.write(Date,Time,TSE.ports[0],TSE.ports[1],TSE.ports[2],TSE.ports[3],TSE.ports[4],TSE.ports[5],TSE.ports[6])

return
label Dummy
; not needed with Avantes spectrometers
return;
label horizont

; Telescope Calibration
; Move Telescope in steps of 0.1 degrees from -2 to 2°
; Acquire spectra and save to log

UV.TExp = 12
UV.Scans = 100

for i=1 to 6
elevmotor.npos = -3
elevmotor.go
elevmotor.waitfor
pause 250
anzahl = 30
LogFile1.Write("pos npos UV")

for i = 1 to anzahl

  gosub dummy;
  uv.go
  pause 1000;
  uv.waitfor
  
  Logfile1.write(elevmotor.pos " "elevmotor.npos " " uv.spec_avg )

  UV.spec_name = "Horizont " %f(elevmotor.npos, 2)
  
  elevmotor.npos = elevmotor.npos + 0.2
  elevmotor.go
  elevmotor.waitfor
Pause 250;
endfor

endfor

return

label Calibrate;
UV.acqmode = 0  ; Set mode of spectrometers, fixed integration and scan number
gosub SERVO_CLOSE;
gosub HG_OFF
; Offset and dark current
;Offset
	
	for i = 1 to number_of_spec
          UV.scans = time_per_calib_spec / texp_ofs
	  
	  UV.texp = texp_ofs
	  
	  UV.go
	  UV.waitfor
	  UV.spec_name = "ofs"	  
	  UV.savespec

          gosub LogSpecInfo;
          gosub LogTempInfo;
	endfor
	
	;Dark Current

	for i = 1 to number_of_spec
          UV.scans = time_per_calib_spec / texp_dc
	  
	  UV.texp = texp_dc
	  UV.go
	  UV.waitfor
	  UV.spec_name = "dc"
	  UV.savespec
          gosub LogSpecInfo;
          gosub LogTempInfo;
endfor

gosub SERVO_OPEN
gosub HG_OFF

return;

label WebcamCapture

if SpectrumCount - WebcamLast < WebcamStep
  return
endif

if WebcamEnable==1
	if WebcamRefOnly==1
		if ElevNdx > 0
			return
		endif
	endif
	
	; Capture webcam image here
	
	WebcamLast = SpectrumCount;
	
    if webcam.capture == false
	webcam.capture = true
        pause 250
    endif

    ; As webcam capture will be also true after setting it
    ; to false, we need to sitch on the webcam again if we
    ; don't have it running the whole time
    if WebcamSwitchOff>0
        webcam.capture = true
        pause 150
    endif

	webcam.save

    if WebcamSwitchOff == 1
        webcam.capture = false;
    endif
	
endif; Webcam Enable

return;


label SERVO_OPEN
;TSE.SENDSTRING("SS0 65");
;pause 100;
return;

label SERVO_CLOSE
;TSE.SENDSTRING("SS0 150");
;pause 100;
return;

label SERVO_HG
;TSE.SENDSTRING("SS0 110");
;pause 100;
return;

label HG_OFF
;TSE.SENDSTRING("RS0 0");
;pause 100;
return;

label HG_ON
;TSE.SENDSTRING("RS1 0");
;pause 100;
return;