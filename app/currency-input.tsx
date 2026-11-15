"use client";
import { useId } from "react";

const names=new Intl.DisplayNames(["en"],{type:"currency"});
const currencies=Intl.supportedValuesOf("currency").map(code=>({code,name:names.of(code)||code}));

export function CurrencyInput({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const listId=useId();
 return <><input required list={listId} maxLength={3} pattern="[A-Z]{3}" placeholder="USD, AUD, FJD…" autoComplete="off" spellCheck={false} value={value} onChange={e=>onChange(e.target.value.toUpperCase())}/><datalist id={listId}>{currencies.map(({code,name})=><option key={code} value={code}>{name}</option>)}</datalist></>;
}
