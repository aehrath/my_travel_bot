import {balanceDueDate,bookingSchema,paid,uid,type Booking,type Vault} from "./travel";

// Importers use empty strings/zero for absent details. Keep existing information
// in that case; all proposed values remain editable in the review.
export function reviewReimport(existing:Booking,incoming:Booking):Booking {
 const draft={...incoming,tripId:existing.tripId,payments:existing.payments,
  travelers:incoming.travelers??existing.travelers,priceBasis:incoming.total||incoming.travelers?"total" as const:existing.priceBasis,perTravelerPrice:incoming.total||incoming.travelers?undefined:existing.perTravelerPrice,
  total:incoming.total||existing.total,currency:incoming.total?incoming.currency:existing.currency,
  notes:[existing.notes,incoming.notes&&!existing.notes.includes(incoming.notes)?incoming.notes:""].filter(Boolean).join("\n\n"),
  ...(!incoming.due&&incoming.dueDaysBefore==null?{due:existing.due,dueDaysBefore:existing.dueDaysBefore}:{}),
 };
 for(const field of ["title","location","confirmation","url","airline","flightNumber","fromAirport","toAirport"] as const)draft[field]=incoming[field]||existing[field];
 // An explicit, dated full payment can complete the existing payment history,
 // but must never add the full amount again over an already recorded deposit.
 const datedPayment=incoming.payments.at(-1);
 if(incoming.total>0&&paid(incoming)===incoming.total&&incoming.payments.every(p=>p.date)&&datedPayment){
  const remaining=Math.round((draft.total-paid(existing))*100)/100;
  if(remaining>0)draft.payments=[...existing.payments,{...datedPayment,id:uid(),amount:remaining,note:"Imported paid-in-full confirmation (remaining balance)"}];
 }
 return {...draft,due:balanceDueDate(draft)};
}

export function replaceImportedReservation(vault:Vault,id:string,reviewed:Booking,addedPayments:Booking["payments"]=[]):Vault {
 const existing=vault.bookings.find(b=>b.id===id);
 if(!existing)throw new Error("This reservation no longer exists. Re-import was not applied.");
 const payments=[...existing.payments];
 for(const payment of addedPayments)if(!payments.some(p=>p.id===payment.id))payments.push(payment);
 const updated=bookingSchema.parse({...reviewed,id,payments});
 return {...vault,bookings:vault.bookings.map(b=>b.id===id?updated:b),artifacts:vault.artifacts.map(a=>a.bookingId===id?{...a,tripId:updated.tripId}:a)};
}
