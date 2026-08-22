"use client";

import Script from "next/script";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface PostcodeResult {
  zonecode: string;
  address: string;
  roadAddress: string;
  autoRoadAddress: string;
  jibunAddress: string;
  buildingName: string;
}

interface PostcodeInstance {
  embed(
    element: HTMLElement,
    options?: {
      autoClose?: boolean;
    },
  ): void;
}

type PostcodeConstructor = new (options: {
  oncomplete: (result: PostcodeResult) => void;
  width?: string;
  height?: string;
}) => PostcodeInstance;

declare global {
  interface Window {
    daum?: {
      Postcode?: PostcodeConstructor;
    };
    kakao?: {
      Postcode?: PostcodeConstructor;
    };
  }
}

export interface PostcodeSelection {
  zonecode: string;
  address: string;
  buildingName: string;
}

function postcodeConstructor() {
  return window.kakao?.Postcode ?? window.daum?.Postcode;
}

export function PostcodeSearch({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (selection: PostcodeSelection) => void;
}) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open || !ready || !frameRef.current) return;
    const Postcode = postcodeConstructor();
    if (!Postcode) return;

    frameRef.current.replaceChildren();
    const instance = new Postcode({
      width: "100%",
      height: "100%",
      oncomplete: (result) => {
        const address =
          result.roadAddress ||
          result.autoRoadAddress ||
          result.address ||
          result.jibunAddress;
        if (!address) {
          setLoadError("선택한 결과에 사용할 수 있는 주소가 없습니다.");
          return;
        }
        onSelectRef.current({
          zonecode: result.zonecode,
          address,
          buildingName: result.buildingName,
        });
        close();
      },
    });
    instance.embed(frameRef.current, { autoClose: false });
  }, [close, open, ready]);

  return (
    <>
      <Script
        src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
        strategy="afterInteractive"
        onReady={() => {
          if (postcodeConstructor()) {
            setReady(true);
            setLoadError("");
          } else {
            setLoadError("위치 검색 모듈 초기화에 실패했습니다.");
          }
        }}
        onError={() => {
          setReady(false);
          setLoadError("위치 검색 모듈을 불러오지 못했습니다.");
        }}
      />
      <button
        ref={triggerRef}
        type="button"
        className="address-search-button"
        aria-haspopup="dialog"
        disabled={disabled || !ready}
        onClick={() => {
          if (!postcodeConstructor()) {
            setReady(false);
            setLoadError("위치 검색 모듈을 사용할 수 없습니다.");
            return;
          }
          setOpen(true);
        }}
      >
        {ready ? "도로명주소 검색" : "주소 검색 준비 중…"}
      </button>
      {loadError && (
        <p className="postcode-load-error" role="alert">
          {loadError} 네트워크 연결을 확인해 주세요.
        </p>
      )}
      {open && (
        <div
          className="postcode-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="postcode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="postcode-title"
          >
            <header>
              <div>
                <span>도로명주소 검색</span>
                <h2 id="postcode-title">주소 찾기</h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="주소 검색 닫기"
                onClick={close}
              >
                ×
              </button>
            </header>
            <div ref={frameRef} className="postcode-frame" />
            <footer>
              도로명이나 건물번호를 검색하고 정확한 주소를 선택해 주세요.
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
