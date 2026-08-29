-- Dump every Find My friend and their nearest map landmarks (up to 3), one pass.
-- Output: tab-separated "Name<TAB>Place1; Place2; Place3" lines.
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
          set p2 to position of e
          set nm2 to d
          if nm2 contains ", " then set nm2 to text 1 thru ((offset of ", " in nm2) - 1) of nm2
          set end of pois to {nm2, p2}
        end if
      end if
    end try
  end repeat
  set outText to ""
  repeat with pers in people
    set pinPos to item 2 of pers
    -- compute distances
    set dists to {}
    repeat with poi in pois
      set pp to item 2 of poi
      set dx to ((item 1 of pp) - (item 1 of pinPos))
      set dy to ((item 2 of pp) - (item 2 of pinPos))
      set end of dists to {(dx * dx + dy * dy), item 1 of poi}
    end repeat
    -- pick nearest 3 (linear min, mark used)
    set chosen to {}
    repeat 3 times
      set bestI to 0
      set bestV to 1.0E+15
      repeat with i from 1 to count of dists
        set dd to item 1 of (item i of dists)
        if dd < bestV then
          set bestV to dd
          set bestI to i
        end if
      end repeat
      if bestI > 0 then
        set end of chosen to item 2 of (item bestI of dists)
        set item 1 of (item bestI of dists) to 1.0E+16
      end if
    end repeat
    set joined to ""
    repeat with c in chosen
      if joined is "" then
        set joined to (c as text)
      else
        set joined to joined & "; " & (c as text)
      end if
    end repeat
    set outText to outText & (item 1 of pers) & tab & joined & linefeed
  end repeat
  return outText
end tell
