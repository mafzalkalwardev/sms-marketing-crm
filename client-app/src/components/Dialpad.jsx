export default function Dialpad({ value, onChange }) {
  const keys = ['1', '2 ABC', '3 DEF', '4 GHI', '5 JKL', '6 MNO', '7 PQRS', '8 TUV', '9 WXYZ', '*', '0', '#'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => {
        const [digit, letters = ''] = key.split(' ');
        return (
          <button
            type="button"
            key={key}
            className="flex h-14 flex-col items-center justify-center rounded-xl border bg-card transition hover:bg-accent"
            onClick={() => onChange(`${value}${digit}`)}
          >
            <strong className="text-lg leading-none">{digit}</strong>
            <span className="text-[10px] tracking-widest text-muted-foreground">{letters}</span>
          </button>
        );
      })}
    </div>
  );
}
