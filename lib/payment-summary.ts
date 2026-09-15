import {bookingSchema,paid,type Booking} from "./travel";

export function editRecordedPayment(booking:Booking,payment:Booking["payments"][number]):Booking {
 if(!booking.payments.some(p=>p.id===payment.id))throw new Error("This payment no longer exists. Reopen the reservation before editing.");
 return bookingSchema.parse({...booking,payments:booking.payments.map(p=>p.id===payment.id?payment:p)});
}

export function reservationTotals(bookings:Booking[]){
 const currencies=new Map<string,{currency:string;total:number;paid:number;remaining:number}>();
 for(const booking of bookings){
  const row=currencies.get(booking.currency)??{currency:booking.currency,total:0,paid:0,remaining:0};
  row.total+=Math.round(booking.total*100);row.paid+=Math.round(paid(booking)*100);
  currencies.set(booking.currency,row);
 }
 return [...currencies.values()].sort((a,b)=>a.currency.localeCompare(b.currency)).map(row=>({...row,total:row.total/100,paid:row.paid/100,remaining:Math.max(0,row.total-row.paid)/100}));
}
