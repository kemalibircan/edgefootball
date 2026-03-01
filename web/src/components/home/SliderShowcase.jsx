import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import "./SliderShowcase.css";

const DEFAULT_SLIDER_IMAGES = [
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1543357480-c60d400e2ef9?auto=format&fit=crop&w=1600&q=80",
];

export default function SliderShowcase({ apiBase }) {
  const { t } = useLanguage();
  const [sliderImages, setSliderImages] = useState(DEFAULT_SLIDER_IMAGES);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const loadSliderImages = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/slider/public`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: ${response.status}`);
      }
      const rows = Array.isArray(payload.items) ? payload.items : [];
      const nextImages = rows
        .map((item) => {
          if (typeof item === "string") return item.trim();
          return String(item?.image_url || "").trim();
        })
        .filter(Boolean)
        .slice(0, 10);
      
      if (nextImages.length > 0) {
        setSliderImages(nextImages);
      }
    } catch (err) {
      console.warn("Failed to load slider images, using defaults:", err);
    }
  }, [apiBase]);

  useEffect(() => {
    loadSliderImages();
  }, [loadSliderImages]);

  useEffect(() => {
    if (!isAutoPlaying || sliderImages.length <= 1) return;

    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % sliderImages.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [isAutoPlaying, sliderImages.length]);

  const goToSlide = (index) => {
    setActiveSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const nextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % sliderImages.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const prevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + sliderImages.length) % sliderImages.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  if (sliderImages.length === 0) return null;

  return (
    <section className="slider-showcase">
      <div className="slider-container">
        <div className="slider-track">
          {sliderImages.map((image, index) => (
            <div
              key={index}
              className={`slider-slide ${index === activeSlide ? "active" : ""}`}
              style={{ backgroundImage: `url(${image})` }}
            />
          ))}
        </div>

        {sliderImages.length > 1 ? (
          <>
            <button className="slider-nav slider-nav-prev" onClick={prevSlide} aria-label="Previous slide">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <button className="slider-nav slider-nav-next" onClick={nextSlide} aria-label="Next slide">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <div className="slider-dots">
              {sliderImages.map((_, index) => (
                <button
                  key={index}
                  className={`slider-dot ${index === activeSlide ? "active" : ""}`}
                  onClick={() => goToSlide(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
