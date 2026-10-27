import type {ButtonHTMLAttributes} from 'react';
export function Button({className='',size,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{size?:string}){return <button className={`inline-flex items-center justify-center rounded px-4 py-2 font-semibold ${className}`} {...props}/>}
