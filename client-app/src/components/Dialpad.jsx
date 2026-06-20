export default function Dialpad({ value, onChange }) {
  const keys = ['1', '2 ABC', '3 DEF', '4 GHI', '5 JKL', '6 MNO', '7 PQRS', '8 TUV', '9 WXYZ', '*', '0', '#'];
  return (
    <div className="dialpad">
      {keys.map((key) => {
        const [digit, letters = ''] = key.split(' ');
        return (
          <button type="button" key={key} onClick={() => onChange(`${value}${digit}`)}>
            <strong>{digit}</strong>
            <span>{letters}</span>
          </button>
        );
      })}
    </div>
  );
}
