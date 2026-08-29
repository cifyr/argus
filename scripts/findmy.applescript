-- Dump every Find My friend and their approximate location (nearest map POI to each pin), one pass.
-- Output: tab-separated "Name<TAB>Place" lines.
tell application "FindMy" to activate
delay 0.8
tell application "System Events" to tell process "FindMy"
  set people to {}
  set pois to {}
  try
    set els to entire contents of window 1
  on error
    return ""
  end try
  repeat with e in els
    try
      set d to description of e
      if d is not missing value and d is not "" then
        if d ends with ",Map pin" then
          set nm to text 1 thru ((offset of ",Map pin" in d) - 1) of d
          set end of people to {nm, position of e}
        else if d is not "Compass" and d does not contain "Zoom" and d does not contain "Heading" and d is not "My Location" and d is not "group" and d is not "image" then
          set end of pois to {d, position of e}
        end if
      end if
    end try
  end repeat
  set outText to ""
  repeat with pers in people
    set pinPos to item 2 of pers
    set bestD to ""
    set bestDist to 1.0E+12
    repeat with poi in pois
      set pp to item 2 of poi
      set dx to ((item 1 of pp) - (item 1 of pinPos))
      set dy to ((item 2 of pp) - (item 2 of pinPos))
      set dist to (dx * dx + dy * dy)
      if dist < bestDist then
        set bestDist to dist
        set bestD to item 1 of poi
      end if
    end repeat
    if bestD contains ", " then set bestD to text 1 thru ((offset of ", " in bestD) - 1) of bestD
    set outText to outText & (item 1 of pers) & tab & bestD & linefeed
  end repeat
  return outText
end tell
