"use client";
import {useEffect,useSyncExternalStore} from "react";
import {subscribeDrive,driveSessionVersion,isDriveConnected,restoreDriveSession} from "./drive";
export function useDriveConnection(){
 useEffect(()=>restoreDriveSession(),[]);
 const revision=useSyncExternalStore(subscribeDrive,driveSessionVersion,()=>0);
 return {connected:isDriveConnected(),revision};
}
